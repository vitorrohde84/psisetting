// Import só de tipo: some na compilação, então o jspdf continua sendo
// carregado sob demanda pelo import() dentro de generatePdfBlob.
import type { jsPDF as JsPDF } from "jspdf";

export interface GeneratePdfOptions {
  filename?: string;
  title?: string;
  quality?: number;
}

export async function generatePdfBlob(
  element: HTMLElement,
  options: GeneratePdfOptions = {}
): Promise<{ blob: Blob; pdf: JsPDF }> {
  // Carregamento dinâmico sob demanda (Lazy dynamic import) para manter o bundle ultra leve
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // Ensure all images are fully loaded before rendering
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    })
  );

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    onclone: (_document, clonedElement) => {
      clonedElement.style.margin = "0";
      clonedElement.style.boxShadow = "none";
      clonedElement.style.backgroundColor = "#ffffff";
    },
  });

  const imgData = canvas.toDataURL("image/jpeg", options.quality ?? 0.98);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * pdfWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  // First page
  pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pdfHeight;

  // Additional pages if needed (only if height left is significant)
  while (heightLeft > 8) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pdfHeight;
  }

  const blob = pdf.output("blob");
  return { blob, pdf };
}

export async function downloadPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const { pdf, blob } = await generatePdfBlob(element, { filename });
  
  // Try programmatic anchor download via object URL first (most reliable on mobile & desktop)
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  } catch {
    // Fallback: standard jsPDF save
    pdf.save(filename);
  }
}

export async function sharePdf(
  element: HTMLElement,
  filename: string,
  title: string = "Documento Psicológico"
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.share) {
    return false;
  }

  try {
    const { blob } = await generatePdfBlob(element, { filename, title });
    const file = new File([blob], filename, { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title,
        text: `Documento clínico gerado via PsiSetting.`,
        files: [file],
      });
      return true;
    }
  } catch (err: unknown) {
    // AbortError = a pessoa fechou a folha de compartilhar; não é falha.
    // Lê name de qualquer objeto (o navegador rejeita com DOMException).
    const nome =
      typeof err === "object" && err !== null && "name" in err
        ? (err as { name?: unknown }).name
        : undefined;
    if (nome !== "AbortError") {
      console.error("Erro ao compartilhar PDF:", err);
    }
  }

  return false;
}
