import { PublicationCreateForm } from '../publication-create-form';

export default function NewPublicationPage() {
  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <p className="eyebrow">ADD TO YOUR LIBRARY</p>
      <h1 id="page-title">Add publication</h1>
      <PublicationCreateForm cancelHref="/publications" />
    </main>
  );
}
