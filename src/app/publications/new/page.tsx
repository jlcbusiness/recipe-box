import { getTags } from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';
import { PublicationCreateForm } from '../publication-create-form';

export default async function NewPublicationPage() {
  const supabase = await createClient();
  const tags = await getTags(supabase);

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <p className="eyebrow">ADD TO YOUR LIBRARY</p>
      <h1 id="page-title">Add publication</h1>
      <PublicationCreateForm cancelHref="/publications" tags={tags} />
    </main>
  );
}
