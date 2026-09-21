import { Carregando } from "@/app/components/carregando";

// Aparece no instante do clique no menu, enquanto o servidor prepara a próxima
// tela: as páginas do painel são force-dynamic, e o Dashboard busca os dados no
// servidor. Sem este arquivo, a interface ficava parada até a resposta chegar.
// Sem `dadosClinicos`: a próxima tela pode ser Configurações, que não abre dado
// clínico, e lá a frase sobre a chave não seria verdadeira.
export default function CarregandoPainel() {
  return <Carregando className="py-24" />;
}
