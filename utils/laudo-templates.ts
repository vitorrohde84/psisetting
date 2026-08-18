/**
 * Modelos de Documentos Psicológicos Padronizados
 * Conforme a Resolução CFP nº 06/2019 (Conselho Federal de Psicologia)
 */

export interface LaudoTemplate {
  id: string;
  label: string;
  badge: string;
  titulo: string;
  descricao: string;
  buildConteudo: (params: {
    pacienteNome?: string;
    pacienteCpf?: string;
    psicologoNome?: string;
    psicologoCrp?: string;
  }) => string;
}

export const CFP_TEMPLATES: LaudoTemplate[] = [
  {
    id: "decl-comparecimento",
    label: "Declaração de Comparecimento",
    badge: "Declaração",
    titulo: "Declaração de Comparecimento",
    descricao: "Para comprovar comparecimento e horário de sessão no trabalho/escola.",
    buildConteudo: ({ pacienteNome, pacienteCpf }) => {
      const nome = pacienteNome || "[Nome do Paciente]";
      const doc = pacienteCpf ? `inscrito(a) no CPF sob o nº ${pacienteCpf}` : "documento nº [CPF/RG]";
      return `Declaro, para os devidos fins a que se fizerem necessários, que o(a) paciente ${nome}, ${doc}, compareceu a este consultório de psicologia na data de hoje, das [00:00] às [00:00], para realização de sessão de atendimento psicológico.

Por ser a expressão da verdade, firmo a presente declaração.`;
    },
  },
  {
    id: "decl-acompanhamento",
    label: "Declaração de Acompanhamento",
    badge: "Declaração",
    titulo: "Declaração de Acompanhamento Psicológico",
    descricao: "Comprova que o paciente realiza processo psicoterapêutico ativo.",
    buildConteudo: ({ pacienteNome, pacienteCpf }) => {
      const nome = pacienteNome || "[Nome do Paciente]";
      const doc = pacienteCpf ? `inscrito(a) no CPF sob o nº ${pacienteCpf}` : "documento nº [CPF/RG]";
      return `Declaro, para os devidos fins a que se fizerem necessários, que o(a) paciente ${nome}, ${doc}, encontra-se sob acompanhamento psicológico regular neste consultório, com frequência [semanal / quinzenal], desde [Mês/Ano de Início].

Ressalta-se que a presente declaração tem como finalidade exclusiva comprovar o processo psicoterapêutico, em estrita conformidade com o Código de Ética Profissional do Psicólogo e a Resolução CFP nº 06/2019, não contendo dados diagnósticos ou sigilosos.`;
    },
  },
  {
    id: "atestado",
    label: "Atestado Psicológico",
    badge: "Atestado",
    titulo: "Atestado Psicológico",
    descricao: "Para justificar faltas, solicitar afastamento ou atestar aptidão.",
    buildConteudo: ({ pacienteNome, pacienteCpf }) => {
      const nome = pacienteNome || "[Nome do Paciente]";
      const doc = pacienteCpf || "[CPF do Paciente]";
      return `I. IDENTIFICAÇÃO DO PACIENTE
Nome: ${nome}
Documento: CPF ${doc}

II. DESCRIÇÃO DA DEMANDA
Atesto, a pedido do(a) próprio(a) paciente, para fins de [especificar a finalidade, ex: justificativa de afastamento de atividades laborais / acadêmicas / perícia].

III. PROCEDIMENTO E FUNDAMENTAÇÃO
O presente atestado fundamenta-se em processo de avaliação e acompanhamento psicológico clínico realizado mediante entrevistas semiestruturadas, escuta clínica e observação do comportamento.

IV. CONCLUSÃO
Com base nos dados coletados e na avaliação clínica, atesto que o(a) paciente apresenta, no presente momento, condições que requerem [especificar a recomendação, ex: afastamento de suas atividades pelo período de XX dias / acompanhamento contínuo], necessitando de repouso e cuidados terapêuticos.`;
    },
  },
  {
    id: "relatorio",
    label: "Relatório Psicológico",
    badge: "Relatório",
    titulo: "Relatório Psicológico",
    descricao: "Comunicação de evolução clínica ou encaminhamento multiprofissional.",
    buildConteudo: ({ pacienteNome, pacienteCpf, psicologoNome, psicologoCrp }) => {
      const nome = pacienteNome || "[Nome do Paciente]";
      const doc = pacienteCpf || "[CPF do Paciente]";
      const psi = psicologoNome || "[Nome da Psicóloga]";
      const crp = psicologoCrp || "[Registro CRP]";
      return `I. IDENTIFICAÇÃO
Pessoa Atendida: ${nome} (CPF: ${doc})
Solicitante: [Nome do Médico solicitante / Instituição / Próprio Paciente]
Finalidade: [Encaminhamento médico / Avaliação multidisciplinar / Acompanhamento terapêutico]
Autora: ${psi} - ${crp}

II. DESCRIÇÃO DA DEMANDA
O(A) paciente iniciou acompanhamento psicológico com a finalidade de [descrever o motivo da busca, queixa principal relatada e histórico relevante].

III. PROCEDIMENTO
Foram realizadas [número de sessões, ex: 12] sessões de psicoterapia clínica individual, utilizando como metodologia a escuta clínica qualificada, entrevistas psicológicas e acompanhamento dos aspectos emocionais e comportamentais.

IV. ANÁLISE
Durante o processo terapêutico, observou-se [descrever a evolução do paciente, principais dinâmicas observadas, recursos de enfrentamento e resposta ao processo terapêutico de forma ética, sem expor dados desnecessários].

V. CONCLUSÃO
Diante do exposto, sugere-se [recomendações, continuidade do acompanhamento psicológico e/ou encaminhamento para avaliação médica/psiquiátrica complementar].`;
    },
  },
  {
    id: "laudo",
    label: "Laudo Psicológico",
    badge: "Laudo Pericial",
    titulo: "Laudo Psicológico",
    descricao: "Estrutura formal de Avaliação Psicológica completa com testagem.",
    buildConteudo: ({ pacienteNome, pacienteCpf, psicologoNome, psicologoCrp }) => {
      const nome = pacienteNome || "[Nome do Paciente]";
      const doc = pacienteCpf || "[CPF do Paciente]";
      const psi = psicologoNome || "[Nome da Psicóloga]";
      const crp = psicologoCrp || "[Registro CRP]";
      return `I. IDENTIFICAÇÃO
Pessoa Avaliada: ${nome} (CPF: ${doc})
Solicitante: [Nome do Solicitante / Juízo / Instituição / Próprio Paciente]
Finalidade: Avaliação Psicológica Clínica / Pericial
Autora: ${psi} - ${crp}

II. DESCRIÇÃO DA DEMANDA
O presente laudo tem por objetivo responder à solicitação referente a [motivo detalhado da avaliação psicológica e quesitos formulados pelo solicitante].

III. PROCEDIMENTO
O processo de avaliação psicológica foi conduzido no período de [Data Início] a [Data Fim], totalizando [XX] sessões de atendimento presencial/online. Foram utilizados os seguintes instrumentos e técnicas devidamente aprovados pelo SATEPSI/CFP:
- Entrevistas clínicas semiestruturadas e anamnese detalhada;
- Observação clínica do comportamento;
- [Listar testes psicológicos validados aplicados, ex: BFP, HTP, WAIS-III, etc.].

IV. ANÁLISE DOS RESULTADOS
A partir da integração dos dados obtidos nas testagens e entrevistas, verificou-se que [descrever os resultados quantitativos e qualitativos, funções cognitivas avaliadas, dinâmica de personalidade e aspectos emocionais].

V. CONCLUSÃO
Com base nos procedimentos técnicos adotados, conclui-se que o(a) avaliado(a) [apresentar a síntese diagnóstica, resposta aos quesitos formulados e parecer conclusivo].`;
    },
  },
];
