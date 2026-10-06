import Link from 'next/link';

export default function RecipeNotFound() {
  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <div className="recipe-page-heading">
        <div>
          <p className="eyebrow">YOUR COOKBOOK SHELF</p>
          <h1 id="page-title">Recipe not found</h1>
        </div>
      </div>
      <p className="recipe-empty-state">
        This recipe is unavailable. <Link href="/recipes">Back to Recipes</Link>
      </p>
    </main>
  );
}
