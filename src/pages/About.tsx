import { PageTitle } from "@/components/ui";
import { PAPER_TITLE, copy } from "@/copy/en";

export function About() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle>{copy.about.title}</PageTitle>
      <p className="text-lg">{copy.about.body}</p>
      <p className="text-muted">{PAPER_TITLE}</p>
      <section>
        <h2 className="text-xl font-bold">{copy.about.privacy}</h2>
        <p className="mt-1">{copy.about.privacyBody}</p>
      </section>
      <section>
        <h2 className="text-xl font-bold">{copy.about.license}</h2>
        <p className="mt-1"><a className="text-accent underline underline-offset-4" href="./paper/paper.pdf">{copy.evidence.paper}</a></p>
      </section>
    </div>
  );
}
