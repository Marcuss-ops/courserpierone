import TemplateH612 from "@/components/funnel/template-h612";

const sampleData = {
  titolo: "Corso Completo di Fotografia",
  sottotitolo: "Impara a scattare foto professionali con il tuo smartphone o reflex. Dai fundamenti alla composizione avanzata.",
  problema: "Sei stanco di scattare foto sfocate, scure o prive di composizione? Il 90% delle persone ha un'ottima fotamera in tasca ma non sa come usarla.",
  storia: `Ho iniziato a scattare foto a 15 anni con una vecchia fotamera mia padre.

Dopo 20 anni di esperienza, migliaia di scatti e decine di workshop tenuti in tutto il mondo, ho raccolto tutto quello che ho imparato in un unico corso.

Non è un corso tecnico noioso. È un percorso pratico che ti porta da zero a scattare foto che raccontano storie.

Ogni lezione è un esercizio concreto che puoi applicare subito, con il tuo smartphone o con la tua reflex.`,
  recensioni: "Finalmente scatto foto che mi fanno orgoglio. Il corso è pratico, diretto, senza pipponi inutili. Consigliatissimo!",
  cta: "Inizia Oggi — Accesso a Vita",
  prezzo: "€49,00",
  coverUrl: undefined,
  lezioni: [
    { titolo: "Le Base della Luce", descrizione: "Capire la luce è il 90% della fotografia. Imparerai a leggerla e usarla a tuo favore." },
    { titolo: "Composizione Vincente", descrizione: "La regola dei terzi, le linee guida, il ritmo visivo. Ogni scatto diventa intenzionale." },
    { titolo: "Fotografia collo Smartphone", descrizione: "Truczi professionali per scattare foto incredibili con quello che hai già in tasca." },
    { titolo: "Editing Base con Lightroom", descrizione: "Le 5 regolazioni che trasformano una foto buona in una foto eccezionale." },
    { titolo: "Raccontare Storie", descrizione: "La fotografia è comunicazione. Impara a creare serie di immagini che raccontano." },
    { titolo: "Progetto Finale", descrizione: "Metti in pratica tutto quello che hai imparato con un progetto personale." },
  ],
};

export default function DemoH612Page() {
  return <TemplateH612 data={sampleData} locale="it" />;
}
