import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface GeneratePdfOptions {
  filename?: string;
  title?: string;
  quality?: number;
}

export async function generatePdfBlob(
  element: HTMLElement,
  options: GeneratePdfOptions = {}
): Promise<{ blob: Blob; pdf: jsPDF }> {
  // Ensure background is solid white for crystal clear capture
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
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

  // Additional pages if needed
  while (heightLeft > 0) {
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
  
  // Try standard jsPDF save first
  try {
    pdf.save(filename);
  } catch {
    // Fallback: programmatic anchor download via object URL (works reliably on some mobile browsers)
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

export async function sharePdf(
  element: HTMLElement,
  filename: string,
  title: string = "Documento"
): Promise<boolean> {
  try {
    const { blob } = await generatePdfBlob(element, { filename, title });
    
    if (typeof navigator !== "undefined" && navigator.share) {
      const file = new File([blob], filename, { type: "application/pdf" });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          files: [file],
        });
        return true;
      }
    }
  } catch (err: unknown) {
    // If user cancelled the share sheet (AbortError), don't treat as error
    if (err instanceof Error && err.name === "AbortError") {
      return true;
    }
    console.warn("Web Share API failed, fallback to download", err);
  }

  // Fallback to download if sharing failed or not supported
  await downloadPdf(element, filename);
  return false;
}
