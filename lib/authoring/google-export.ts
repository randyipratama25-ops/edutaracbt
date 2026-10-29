// Explicit file adapter; never fetch arbitrary Google URLs or request OAuth credentials.
type FormsItem = {
  title?: string;
  questionItem?: {
    question?: {
      grading?: {
        pointValue?: number;
        correctAnswers?: { answers?: { value: string }[] };
      };
      choiceQuestion?: { type?: string; options?: { value?: string }[] };
      textQuestion?: unknown;
      required?: boolean;
    };
  };
};
export function fromGoogleExport(form: { items: FormsItem[] }) {
  if (!Array.isArray(form.items)) throw Error("Ekspor Forms tidak valid.");
  return form.items
    .filter((i) => i.questionItem)
    .map((i) => {
      const q = i.questionItem!.question;
      if (!q) throw Error("Pertanyaan Forms tidak tersedia.");
      const choice = q.choiceQuestion;
      if (
        choice &&
        !["RADIO", "CHECKBOX", "DROP_DOWN"].includes(choice.type || "")
      )
        throw Error("Tipe Google Forms tidak didukung.");
      if (!choice && !q.textQuestion)
        throw Error("Hanya pilihan dan teks yang didukung.");
      const options = (choice?.options || []).map((o, n) => ({
        id: "o" + (n + 1),
        text: o.value || "",
      }));
      const answers = q.grading?.correctAnswers?.answers || [];
      return {
        type: choice
          ? choice.type === "CHECKBOX"
            ? "PG_KOMPLEKS"
            : "PG"
          : "Esai",
        stem: i.title || "",
        points: q.grading?.pointValue || 1,
        required: !!q.required,
        options,
        key: choice
          ? answers.map((a) => {
              const o = options.find((o) => o.text === a.value);
              if (!o) throw Error("Kunci Forms tidak cocok dengan opsi.");
              return o.id;
            })
          : [],
        rubric: "",
        explanation: "",
        attachments: [],
      };
    });
}
