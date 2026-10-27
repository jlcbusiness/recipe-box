import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { PrivateShell } from '../private-shell';

export default async function HelpPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('is_admin, hand_preference')
    .eq('id', data.user.id)
    .maybeSingle();

  return (
    <PrivateShell
      avatarUrl={data.user.user_metadata.avatar_url ?? data.user.user_metadata.picture}
      email={data.user.email ?? 'Unknown email'}
      handPreference={account?.hand_preference === 'left' ? 'left' : 'right'}
      navigation={[
        { href: '/publications', label: 'Library' },
        { href: '/settings', label: 'Settings' },
        ...(account?.is_admin ? [{ href: '/admin', label: 'Administration' }] : []),
      ]}
    >
      <main aria-labelledby="page-title" className="help-main">
        <h1 id="page-title">Help</h1>
        <section aria-labelledby="instruction-encoding-title">
          <h2 id="instruction-encoding-title">Instruction encoding</h2>
          <p>
            Type these forms in an instruction. Confirmed photo and ingredient references are linked
            when the recipe is saved.
          </p>
          <dl className="help-encoding-list">
            <div>
              <dt>Ingredient</dt>
              <dd>
                Type <code>#</code> and choose an ingredient suggestion. If there is more than one
                section, the reference includes the section in its code; for example,{' '}
                <code>#sugar-sauce</code>. If an ingredient is divided, the two parts are referenced
                in the code with <code>-1</code> and <code>-2</code> at the end. For instance,{' '}
                <code>#sugar-sauce-1</code>. Ordinary unconfirmed text remains unlinked.
              </dd>
            </div>
            <div>
              <dt>Pairs With</dt>
              <dd>
                Type <code>#</code> and choose a recipe suggestion to create a recipe link. Ordinary
                unconfirmed text remains unlinked.
              </dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>
                Surround a duration with equals signs, for example <code>=10 minutes=</code> or{' '}
                <code>=one hour=</code>.
              </dd>
            </div>
            <div>
              <dt>Temperature</dt>
              <dd>
                Use <code>F!400</code> or <code>C!200</code>. The private reader converts numeric
                temperatures to your preferred unit. Mark stove heat as <code>!medium low!</code>,
                it is shown without the delimiters.
              </dd>
            </div>
            <div>
              <dt>Photo</dt>
              <dd>
                Type <code>+p</code> to choose a recipe photo, or enter its code as{' '}
                <code>+photoNN</code>. For example, <code>+photo37-w240-left-steponly</code> sets a
                240px left float that stays within that step. <code>-wNN</code> sets width;
                <code>-left</code> or <code>-center</code> sets alignment; <code>-steponly</code>{' '}
                keeps later steps below the image; and <code>-nowrap</code> places the image on its
                own line. Modifiers may be combined, such as <code>+photo37-center-w240</code>.
                Without a width modifier, the image is 200px.
              </dd>
            </div>
            <div>
              <dt>Markdown</dt>
              <dd>
                Use <code>**bold**</code>, <code>*italic*</code>, <code>~~strikethrough~~</code>,{' '}
                <code>`code`</code>, <code>[label](https://example.com)</code>, headings with{' '}
                <code># </code>, and ordered or unordered list markers.
              </dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="keyboard-shortcuts-title">
          <h2 id="keyboard-shortcuts-title">Keyboard shortcuts</h2>
          <p>
            Focus the relevant control before using a shortcut. <code>Ctrl</code> means the Control
            key.
          </p>
          <br />
          <div className="help-shortcut-groups">
            <div>
              <h3>Moving between controls</h3>
              <ul>
                <li>
                  <code>Tab</code> moves forward; <code>Shift+Tab</code> moves backward.
                </li>
                <li>
                  <code>Enter</code> or <code>Space</code> activates a focused button or option.
                </li>
              </ul>
            </div>
            <div>
              <h3>Editing ingredients</h3>
              <ul>
                <li>
                  In the desktop ingredient table, <code>Enter</code> on a cell starts editing; a
                  printable character starts with that character.
                </li>
                <li>
                  <code>Ctrl+ArrowUp</code> or <code>Ctrl+ArrowDown</code> moves an ingredient row.
                </li>
                <li>
                  In suggestions, <code>ArrowUp</code> and <code>ArrowDown</code> change the
                  highlighted option. <code>Enter</code> accepts it or commits typed text when no
                  list is open.
                </li>
                <li>
                  <code>Tab</code> accepts the active suggestion and moves to the next ingredient
                  cell.
                </li>
                <li>
                  In an inline ingredient editor, <code>Enter</code> commits and <code>Escape</code>{' '}
                  cancels.
                </li>
                <li>
                  Measurement picklists use <code>ArrowUp</code>/<code>ArrowDown</code> to open or
                  move, <code>Home</code>/<code>End</code> to choose the first or last option,
                  <code>Enter</code>/<code>Space</code> to open or choose, and <code>Escape</code>{' '}
                  to close.
                </li>
                <li>
                  On mobile, <code>Enter</code> applies a regular row or accepts a suggestion;
                  <code>Escape</code> closes the editor or cancels a suggestion edit.
                </li>
              </ul>
            </div>
            <div>
              <h3>Editing instructions</h3>
              <ul>
                <li>
                  Type <code>#</code> to open ingredient suggestions; use <code>ArrowUp</code> or{' '}
                  <code>ArrowDown</code>, then <code>Enter</code> to choose.
                </li>
                <li>
                  <code>Ctrl+.</code> inserts a degree symbol at the caret, replacing selected text.
                </li>
                <li>
                  <code>Enter</code> creates the next step; <code>Shift+Enter</code> inserts a line
                  break in the current step.
                </li>
                <li>
                  <code>Ctrl+ArrowUp</code> or <code>Ctrl+ArrowDown</code> moves an instruction
                  step.
                </li>
                <li>
                  <code>Escape</code> closes ingredient suggestions and keeps the typed{' '}
                  <code>#</code> text; otherwise it cancels a new step or restores the existing step
                  text.
                </li>
              </ul>
            </div>
            <div>
              <h3>Picklists and photos</h3>
              <ul>
                <li>
                  <code>Escape</code> closes an open recipe picklist and returns focus to its
                  trigger.
                </li>
                <li>
                  <code>Tab</code> reaches numbered photo buttons; <code>Enter</code> or{' '}
                  <code>Space</code> temporarily selects a featured photo without changing its
                  primary status or order.
                </li>
                <li>
                  In photo management, focus starts on the pane heading; <code>Enter</code> or{' '}
                  <code>Space</code> makes a focused photo the default. The first photo is the
                  default initially.
                </li>
                <li>
                  <code>Ctrl+ArrowLeft</code>/<code>Ctrl+ArrowRight</code> moves a photo
                  horizontally; <code>Ctrl+ArrowUp</code>/<code>Ctrl+ArrowDown</code> moves it one
                  row. Moves beyond the grid do nothing, and focus stays on the moved photo.
                </li>
                <li>
                  <code>Ctrl+V</code> or <code>Command+V</code> pastes an image in the open
                  photo-management pane.
                </li>
                <li>
                  On mobile, the photo paste target is skipped by <code>Tab</code> but can be tapped
                  to open the device Paste menu.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </PrivateShell>
  );
}
