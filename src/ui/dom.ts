/*
 * Small helpers for building the panel's HTML. Everything is built with
 * createElement and textContent, never innerHTML, so it works under strict
 * page security policies and can never run text as code.
 */

/** Creates an element, optionally with a CSS class and some text. */
export function el<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Creates a button that does not submit a form. */
export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const buttonElement = el('button', className, text);
  buttonElement.type = 'button';
  buttonElement.addEventListener('click', onClick);
  return buttonElement;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd". */
export function ordinal(number: number): string {
  const lastDigit = number % 10;
  const lastTwoDigits = number % 100;
  if (lastDigit === 1 && lastTwoDigits !== 11) return `${number}st`;
  if (lastDigit === 2 && lastTwoDigits !== 12) return `${number}nd`;
  if (lastDigit === 3 && lastTwoDigits !== 13) return `${number}rd`;
  return `${number}th`;
}

/** "1 slot" or "3 slots". */
export function pluralizeSlots(count: number): string {
  return `${count} ${count === 1 ? 'slot' : 'slots'}`;
}

/**
 * A <details> box that remembers whether the player opened or closed it.
 * The panel is rebuilt on every refresh, so the choice is kept in
 * `foldedSections`: it holds the keys of boxes that differ from their default.
 */
export function foldable(
  foldedSections: Set<string>,
  className: string,
  key: string,
  openByDefault: boolean,
): HTMLDetailsElement {
  const box = el('details', className);
  const playerChangedIt = foldedSections.has(key);
  box.open = playerChangedIt ? !openByDefault : openByDefault;

  box.addEventListener('toggle', () => {
    if (box.open === openByDefault) foldedSections.delete(key);
    else foldedSections.add(key);
  });
  return box;
}

/** Two aligned columns: a bold name and what to know about it. */
export function pairs(rows: [string, string][]): HTMLElement {
  const grid = el('div', 'kv');
  for (const [name, description] of rows) {
    grid.append(el('span', 'k', name), el('span', 'v', description));
  }
  return grid;
}

/** A numbered (ol) or bulleted (ul) list of plain lines. */
export function list(tag: 'ol' | 'ul', lines: string[]): HTMLElement {
  const listElement = el(tag);
  for (const line of lines) listElement.append(el('li', undefined, line));
  return listElement;
}

/** A small heading followed by its content. Returns both, ready to append. */
export function labelled(label: string, content: HTMLElement | string): HTMLElement[] {
  const contentElement = typeof content === 'string' ? el('div', undefined, content) : content;
  return [el('div', 'label', label), contentElement];
}

/** A box with a title and a body, which is the shape of every popup and banner. */
export function step(title: string, ...bodyElements: HTMLElement[]): HTMLElement {
  const stepElement = el('div', 'step');
  stepElement.append(el('div', 'step-title', title), ...bodyElements);
  return stepElement;
}
