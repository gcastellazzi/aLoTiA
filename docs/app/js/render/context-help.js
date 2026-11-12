/** Contextual help lives beside its controls; live readings stay in the panel.
 * Descriptions remain in the DOM so existing tracing updates also reach help.
 * Native <dialog> provides keyboard focus containment, Escape and focus return. */
export function installContextHelp(root = document) {
  const dialog = document.createElement('dialog');
  dialog.className = 'context-help-dialog'; dialog.id = 'contextHelpDialog';
  const heading = document.createElement('h2'); heading.id = 'contextHelpTitle';
  dialog.setAttribute('aria-labelledby', heading.id);
  const header = document.createElement('div'); header.className = 'context-help-header';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
  const content = document.createElement('div'); content.className = 'context-help-body';
  header.append(heading, close); dialog.append(header, content); document.body.append(dialog);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('click', (event) => {
    const r = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
  });
  let opener;
  dialog.addEventListener('close', () => { opener?.setAttribute('aria-expanded', 'false'); opener?.focus(); });
  const groups = new Map();
  root.querySelectorAll('[data-help-for]').forEach((description) => {
    const target = root.querySelector(description.dataset.helpFor);
    if (!target) return;
    const anchor = target.closest('label') ?? target.closest('.row') ?? target;
    if (!groups.has(anchor)) groups.set(anchor, []);
    groups.get(anchor).push(description);
    description.classList.add('context-description');
  });
  for (const [anchor, descriptions] of groups) {
    const wrapper = document.createElement('div'); wrapper.className = 'help-control';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'context-help-button'; button.textContent = '?';
    const title = descriptions[0].dataset.helpTitle;
    button.setAttribute('aria-label', `Help: ${title}`); button.title = `Help: ${title}`;
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', dialog.id); button.setAttribute('aria-expanded', 'false');
    anchor.before(wrapper); wrapper.append(anchor, button);
    const refresh = () => { wrapper.hidden = anchor.hidden || descriptions.every((p) => p.hidden); };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(anchor, { attributes: true, attributeFilter: ['hidden'] });
    descriptions.forEach((p) => observer.observe(p, { attributes: true, attributeFilter: ['hidden'] }));
    button.addEventListener('click', () => {
      opener = button; heading.textContent = title; content.replaceChildren();
      descriptions.filter((p) => !p.hidden).forEach((p) => {
        const copy = p.cloneNode(true); copy.removeAttribute('id'); copy.removeAttribute('class');
        copy.removeAttribute('data-help-for'); copy.removeAttribute('data-help-title');
        copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
        content.append(copy);
      });
      button.setAttribute('aria-expanded', 'true'); dialog.showModal();
    });
  }
}
