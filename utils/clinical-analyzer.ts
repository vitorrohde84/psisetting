/**
 * Utilitário de Processamento de Linguagem Natural (NLP) 100% Client-Side.
 * Executado estritamente na memória do navegador da psicóloga após a descriptografia local.
 * Zero envio para servidores externos — Conformidade total com o CFP e a LGPD.
 */

export interface ThemeInsight {
  term: string;
  count: number;
  category: "sintoma" | "emocional" | "relacional" | "contexto" | "geral";
  sessionIds: string[];
}

export interface ClinicalAnalysisResult {
  topKeywords: ThemeInsight[];
  relationalMentions: ThemeInsight[];
  totalWords: number;
  totalSessionsAnalyzed: number;
}

// Dicionário extensivo de stopwords em português (palavras estruturais irrelevantes para o estudo de caso)
const PORTUGUESE_STOPWORDS = new Set([
  "a", "à", "ao", "aos", "às", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "dum", "duma", "duns", "dumas", "dele", "dela", "deles", "delas",
  "em", "na", "no", "nas", "nos", "num", "numa", "nuns", "numas", "nele", "nela", "neles", "nelas",
  "por", "para", "pra", "pela", "pelo", "pelas", "pelos", "com", "sem", "sob", "sobre", "entre", "até",
  "que", "se", "como", "quando", "onde", "porque", "porquê", "pois", "mas", "porém", "contudo", "todavia",
  "ou", "e", "nem", "já", "não", "sim", "também", "muito", "pouco", "mais", "menos", "tão", "tanto",
  "eu", "tu", "ele", "ela", "nós", "vós", "eles", "elas", "você", "vocês", "me", "te", "se", "lhe", "lhes",
  "meu", "minha", "meus", "minhas", "teu", "tua", "teus", "tuas", "seu", "sua", "seus", "suas", "nosso", "nossa",
  "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas", "aquele", "aquela", "aqueles", "aquelas",
  "isso", "isto", "aquilo", "mesmo", "mesma", "mesmos", "mesmas", "outro", "outra", "outros", "outras",
  "ser", "estar", "foi", "era", "é", "são", "está", "estão", "estava", "estavam", "estive", "esteve",
  "ter", "tem", "tinha", "tinham", "teve", "tiveram", "fazer", "faz", "fazia", "fez", "fizeram",
  "dizer", "disse", "diz", "dizia", "disseram", "falar", "falou", "fala", "falava", "falaram",
  "relata", "relatou", "relatam", "refere", "referiu", "referem", "traz", "trouxe", "trazem",
  "paciente", "sessão", "sessao", "atendimento", "durante", "após", "apos", "início", "fim",
  "hoje", "ontem", "dia", "semana", "mês", "ano", "vez", "vezes", "coisa", "coisas", "tudo", "nada",
  "bem", "mal", "assim", "então", "aqui", "ali", "lá", "ainda", "sempre", "nunca", "quase", "apenas"
]);

// Categorias e termos clínicos conhecidos para classificação inteligente
const CLINICAL_CATEGORIES: Record<string, "sintoma" | "emocional" | "relacional" | "contexto" | "geral"> = {
  // Relacional (Figuras Centrais)
  "mãe": "relacional", "mae": "relacional", "pai": "relacional", "pais": "relacional",
  "irmão": "relacional", "irmao": "relacional", "irmã": "relacional", "irma": "relacional",
  "esposa": "relacional", "esposo": "relacional", "marido": "relacional", "namorado": "relacional",
  "namorada": "relacional", "filho": "relacional", "filha": "relacional", "filhos": "relacional",
  "família": "relacional", "familia": "relacional", "amigo": "relacional", "amiga": "relacional",
  "amigos": "relacional", "chefe": "relacional", "colega": "relacional", "casamento": "relacional",

  // Sintomas / Queixas Clínicas
  "ansiedade": "sintoma", "ansioso": "sintoma", "ansiosa": "sintoma", "angústia": "sintoma", "angustia": "sintoma",
  "insônia": "sintoma", "insonia": "sintoma", "sono": "sintoma", "cansaço": "sintoma", "cansaco": "sintoma",
  "fadiga": "sintoma", "depressão": "sintoma", "depressao": "sintoma", "tristeza": "sintoma",
  "pânico": "sintoma", "panico": "sintoma", "crise": "sintoma", "choro": "sintoma", "dor": "sintoma",
  "medicação": "sintoma", "medicacao": "sintoma", "remédio": "sintoma", "remedio": "sintoma",

  // Estados Emocionais / Afetivos
  "culpa": "emocional", "medo": "emocional", "raiva": "emocional", "frustração": "emocional", "frustracao": "emocional",
  "insegurança": "emocional", "inseguranca": "emocional", "solidão": "emocional", "solidao": "emocional",
  "desespero": "emocional", "alívio": "emocional", "alivio": "emocional", "esperança": "emocional",
  "luto": "emocional", "perda": "emocional", "vergonha": "emocional", "autoestima": "emocional",

  // Contexto / Estressores
  "trabalho": "contexto", "emprego": "contexto", "estudos": "contexto", "faculdade": "contexto",
  "dinheiro": "contexto", "financeiro": "contexto", "rotina": "contexto", "mudança": "contexto", "mudanca": "contexto",
  "futuro": "contexto", "cobrança": "contexto", "cobranca": "contexto", "pressão": "contexto", "pressao": "contexto"
};

/**
 * Normaliza uma palavra para contagem sem pontuação e em minúsculas
 */
function cleanWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”«»[\]]/g, "")
    .trim();
}

/**
 * Analisa as evoluções clínicas descriptografadas de um paciente
 */
export function analyzeClinicalEvolutions(
  evolutions: Array<{ id: string; data: string; conteudo: string }>
): ClinicalAnalysisResult {
  if (!evolutions || evolutions.length === 0) {
    return {
      topKeywords: [],
      relationalMentions: [],
      totalWords: 0,
      totalSessionsAnalyzed: 0,
    };
  }

  const wordFrequencyMap = new Map<string, { count: number; sessionIds: Set<string> }>();
  let totalWordCount = 0;

  evolutions.forEach((evo) => {
    if (!evo.conteudo) return;

    // Quebra o texto da evolução em palavras
    const tokens = evo.conteudo.split(/\s+/);
    totalWordCount += tokens.length;

    tokens.forEach((rawWord) => {
      const word = cleanWord(rawWord);

      // Descarta palavras muito curtas ou stopwords estruturais
      if (word.length < 3 || PORTUGUESE_STOPWORDS.has(word) || /^\d+$/.test(word)) {
        return;
      }

      if (!wordFrequencyMap.has(word)) {
        wordFrequencyMap.set(word, { count: 1, sessionIds: new Set([evo.id]) });
      } else {
        const item = wordFrequencyMap.get(word)!;
        item.count += 1;
        item.sessionIds.add(evo.id);
      }
    });
  });

  const allThemes: ThemeInsight[] = [];
  const relationalList: ThemeInsight[] = [];

  wordFrequencyMap.forEach((val, term) => {
    // Filtro: manter palavras mencionadas pelo menos 2 vezes ou termos clínicos chave
    const category = CLINICAL_CATEGORIES[term] || "geral";

    if (val.count >= 2 || category !== "geral") {
      const insight: ThemeInsight = {
        term: term.charAt(0).toUpperCase() + term.slice(1),
        count: val.count,
        category,
        sessionIds: Array.from(val.sessionIds),
      };

      if (category === "relacional") {
        relationalList.push(insight);
      }
      allThemes.push(insight);
    }
  });

  // Ordena por relevância (termos clínicos identificados primeiro, seguidos por frequência)
  allThemes.sort((a, b) => {
    const isClinicalA = a.category !== "geral" ? 1 : 0;
    const isClinicalB = b.category !== "geral" ? 1 : 0;
    if (isClinicalA !== isClinicalB) return isClinicalB - isClinicalA;
    return b.count - a.count;
  });

  relationalList.sort((a, b) => b.count - a.count);

  return {
    topKeywords: allThemes.slice(0, 16), // Top 16 termos mais expressivos
    relationalMentions: relationalList.slice(0, 8), // Top 8 figuras relacionais
    totalWords: totalWordCount,
    totalSessionsAnalyzed: evolutions.length,
  };
}
