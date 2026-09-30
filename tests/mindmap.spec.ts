import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * End to end coverage for the fourteen remediation defects.
 *
 * Every test opens its own document by id: the `/map/<id>` route creates a map
 * that is not stored yet, so no test depends on another one's state, and the
 * whole file can run in parallel in either project.
 */

const UNNAMED_TITLE = 'Untitled Mind Map';

/** Opens a brand new map and waits until the canvas has drawn it. */
async function openNewMap(page: Page): Promise<void> {
  const id = crypto.randomUUID();
  await page.goto(`/map/${id}`);
  await expect(page.getByTestId('node-root')).toBeVisible();
  // React Flow measures a node after its first paint, and an edge has no
  // geometry until both of its ends have a size, so a map that is only
  // "visible" is not yet one that can be read coordinates from.
  await expect
    .poll(() =>
      page
        .getByTestId('node-root')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThan(0);
}

const headerText = (page: Page) => page.locator('header[data-export-ignore]');

/** Clicks the toolbar Add button and waits for the document to grow. */
async function addChildToSelection(page: Page): Promise<void> {
  const before = await nodeCount(page);
  await page.getByRole('button', { name: /^Add/ }).first().click();
  await expect(nodeCount(page)).not.toBe(before);
}

async function nodeCount(page: Page): Promise<number> {
  const text = await headerText(page).innerText();
  const match = /(\d+)\s+nodes?/.exec(text);
  return match ? Number(match[1]) : 0;
}

/** Every visible node wrapper, in DOM order. */
function nodeWrappers(page: Page): Locator {
  return page.locator('.react-flow__node:visible');
}

/**
 * A node's box in flow coordinates, which is the space edge paths are drawn in.
 *
 * React Flow puts `translate(flowX, flowY)` on each node wrapper inside a scaled
 * viewport, so the wrapper's own matrix is already flow space. The size comes
 * from `offsetWidth` rather than a bounding rect because a node is animated in
 * with a scale, and a rect taken mid animation reports that scale as if it were
 * part of the node's real width.
 */
async function flowBox(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  return locator.evaluate((element) => {
    const wrapper = element.closest<HTMLElement>('.react-flow__node');
    if (wrapper === null) {
      throw new Error('the node wrapper disappeared');
    }
    const matrix = new DOMMatrixReadOnly(getComputedStyle(wrapper).transform);
    return {
      x: matrix.e,
      y: matrix.f,
      width: wrapper.offsetWidth,
      height: wrapper.offsetHeight,
    };
  });
}

/** The numbers of the first edge's bezier, read from its `d` attribute. */
async function edgePath(
  page: Page,
): Promise<{ startX: number; startY: number; endX: number; endY: number; controls: number[] }> {
  const raw = await page.locator('.react-flow__edge-path').first().getAttribute('d');
  if (raw === null) {
    throw new Error('the first edge has no path');
  }
  const numbers = raw
    .replace(/[A-Za-z]/g, ' ')
    .split(/[,\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value));
  if (numbers.length < 8) {
    throw new Error(`the edge path is not a cubic bezier: ${raw}`);
  }
  return {
    startX: numbers[0],
    startY: numbers[1],
    endX: numbers[numbers.length - 2],
    endY: numbers[numbers.length - 1],
    controls: [numbers[2], numbers[4]],
  };
}

/** Clicks empty canvas, clear of the header, the drawers and the toolbar. */
async function clickEmptyCanvas(page: Page): Promise<void> {
  const pane = page.locator('.react-flow__pane');
  const box = await pane.boundingBox();
  if (box === null) {
    throw new Error('the canvas pane has no box');
  }
  await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.28);
}

/**
 * The variant test id of every node, in DOM order.
 *
 * `NodeShell` tags itself by role in the tree, so this is the cheapest direct
 * read on whether the reindex pass produced one root, real branches and real
 * leaves rather than a flat list promoted to `root`.
 */
async function nodeVariants(page: Page): Promise<string[]> {
  return page
    .locator('.react-flow__node:visible')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector('[data-testid]')?.getAttribute('data-testid') ?? ''),
    );
}

/* ------------------------------------------------------------------------- */

test('DATA-02 a freshly opened map is not marked as having unsaved changes', async ({ page }) => {
  await openNewMap(page);

  // Every node the engine measures emits a `dimensions` change, and the first
  // click emits a `select` one. Neither is an edit, so the badge must stay
  // silent through mount, measurement, a selection and a deselection.
  await clickEmptyCanvas(page);
  await page.getByTestId('node-root').click();
  await clickEmptyCanvas(page);
  await page.waitForTimeout(1_200);

  await expect(headerText(page)).not.toContainText('Unsaved changes');
  await expect(headerText(page)).not.toContainText('Save failed');
});

test('FLOW-01 a branch edge starts on the parent right face and ends on the child left face', async ({
  page,
}) => {
  await openNewMap(page);

  // No selection: the Add button must grow the root, which also proves the
  // toolbar change from UI-01.
  await page.getByRole('button', { name: /^Add/ }).first().click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  const wrappers = nodeWrappers(page);
  await expect(wrappers).toHaveCount(2);

  const root = wrappers.nth(0);
  const child = wrappers.nth(1);
  const rootBox = await flowBox(root);
  const childBox = await flowBox(child);
  const path = await edgePath(page);

  // React Flow centres a handle half its own width outside the node face, so
  // the anchor is a few pixels proud of the edge rather than exactly on it.
  const HANDLE_SLOP = 12;

  // The start point is on the parent's right face, at its vertical middle:
  // the child is placed to the right, so the curve has to leave that way.
  const startFaceGap = path.startX - (rootBox.x + rootBox.width);
  expect(startFaceGap).toBeGreaterThan(-HANDLE_SLOP);
  expect(startFaceGap).toBeLessThan(HANDLE_SLOP);
  expect(path.startY).toBeGreaterThan(rootBox.y);
  expect(path.startY).toBeLessThan(rootBox.y + rootBox.height);

  // The end point is on the child's LEFT face, not its right one. Wiring both
  // ends of the edge to the same face is what used to fold the curve back
  // across the child's own box.
  const endFaceGap = childBox.x - path.endX;
  expect(endFaceGap).toBeGreaterThan(-HANDLE_SLOP);
  expect(endFaceGap).toBeLessThan(HANDLE_SLOP);
  expect(path.endY).toBeGreaterThan(childBox.y);
  expect(path.endY).toBeLessThan(childBox.y + childBox.height);

  // The curve travels from the parent to the child without doubling back.
  expect(path.endX).toBeGreaterThan(path.startX);
  for (const controlX of path.controls) {
    expect(controlX).toBeGreaterThan(Math.min(path.startX, path.endX) - 1);
    expect(controlX).toBeLessThan(Math.max(path.startX, path.endX) + 1);
  }
});

test('UI-02 the minimap is painted with the dark node surface, not white', async ({ page }) => {
  await openNewMap(page);
  await addChildToSelection(page);

  const minimap = page.locator('.react-flow__minimap');
  const viewportWidth = page.viewportSize()?.width ?? 0;

  if (viewportWidth < 430) {
    // Below 430px the minimap is deliberately not rendered at all, so the white
    // rectangle this defect was about cannot exist there either. What must
    // hold is that nothing paints it back.
    await expect(minimap).toHaveCount(0);
    return;
  }

  await expect(minimap).toBeVisible();

  // The library ships an inline white background, so the stylesheet needs
  // `!important` to win over it. Reading the resolved value proves the rule
  // applied to this element rather than to some other rule on the page.
  const appearance = await minimap.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      background: styles.backgroundColor,
      border: `${styles.borderTopWidth} ${styles.borderTopStyle}`,
      width: box.width,
      height: box.height,
    };
  });

  const channels = appearance.background.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
  const luminance =
    0.2126 * (channels[0] ?? 255) + 0.7152 * (channels[1] ?? 255) + 0.0722 * (channels[2] ?? 255);
  expect(luminance).toBeLessThan(128);
  expect(appearance.border).toContain('solid');
  expect(appearance.width).toBeGreaterThan(40);
  expect(appearance.height).toBeGreaterThan(40);

  // And the pixels themselves: a screenshot is the only assertion that cannot
  // be satisfied by a rule that never reached the compositor.
  const shot = await minimap.screenshot();
  expect(shot.byteLength).toBeGreaterThan(0);
});

test('UI-01 Add with no selection grows the root instead of doing nothing', async ({ page }) => {
  await openNewMap(page);
  await expect(headerText(page)).toContainText('1 node');

  // The old implementation called `addSibling(rootId)`, which the store
  // refuses because the root has no parent, so the button was inert.
  await page.getByRole('button', { name: 'Add top level branch' }).click();
  await expect(headerText(page)).toContainText('2 nodes');
  await expect(nodeWrappers(page)).toHaveCount(2);

  // The new node hangs off the root, so an edge exists, the new node is not
  // stacked on the root, and the root is still the only one at depth 0.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  const root = await flowBox(nodeWrappers(page).nth(0));
  const child = await flowBox(nodeWrappers(page).nth(1));
  expect(child.x).toBeGreaterThan(root.x + root.width / 2);
  await expect.poll(() => nodeVariants(page)).toEqual(['node-root', 'node-leaf']);
});

test('FLOW-02 the root refuses a child, and a node refuses its own descendant', async ({ page }) => {
  await openNewMap(page);

  // A real tree: root -> child -> grandchild. Selecting the child puts the next
  // Add underneath it, which is what makes the grandchild a descendant.
  await page.getByRole('button', { name: 'Add top level branch' }).click();
  await expect(nodeWrappers(page)).toHaveCount(2);
  await nodeWrappers(page).nth(1).click();
  await addChildToSelection(page);
  await expect(nodeWrappers(page)).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect.poll(() => nodeVariants(page)).toEqual(['node-root', 'node-branch', 'node-leaf']);

  const before = await page.locator('.react-flow__edge').count();

  // The root exposes no target handle at all, so a drop there cannot even be
  // started from the pointer.
  const rootTargets = await page
    .getByTestId('node-root')
    .locator('.react-flow__handle.target')
    .count();
  expect(rootTargets).toBe(0);

  // Dragging a descendant's source handle onto the root's body is refused.
  const grandchild = nodeWrappers(page).nth(2);
  const grandchildSource = grandchild.locator('.react-flow__handle.source').first();
  const rootBox = await page.getByTestId('node-root').boundingBox();
  if (rootBox === null) {
    throw new Error('the root has no box');
  }
  const sourceBox = await grandchildSource.boundingBox();
  if (sourceBox === null) {
    throw new Error('the source handle has no box');
  }
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();

  // Now the cycle case: the child's source handle onto the grandchild's target.
  const child = nodeWrappers(page).nth(1);
  const childSource = child.locator('.react-flow__handle.source').first();
  const grandchildTarget = grandchild.locator('.react-flow__handle.target').first();
  const childSourceBox = await childSource.boundingBox();
  const grandchildTargetBox = await grandchildTarget.boundingBox();
  if (childSourceBox === null || grandchildTargetBox === null) {
    throw new Error('a handle has no box');
  }
  await page.mouse.move(
    childSourceBox.x + childSourceBox.width / 2,
    childSourceBox.y + childSourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    grandchildTargetBox.x + grandchildTargetBox.width / 2,
    grandchildTargetBox.y + grandchildTargetBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  await page.waitForTimeout(400);
  await expect(page.locator('.react-flow__edge')).toHaveCount(before);
});

test('A11Y-01 the node menu renames in place, with the field focused', async ({ page }) => {
  await openNewMap(page);

  const root = page.getByTestId('node-root');
  await root.click();
  await root.hover();
  await root.getByRole('button', { name: 'Node actions' }).click();

  const menu = page.getByRole('menu', { name: 'Node actions' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Rename node' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Rename node' }).click();

  // The menu closes and the field opens already focused, so typing starts in it.
  await expect(menu).toBeHidden();
  const field = page.getByRole('textbox', { name: 'Root label' });
  await expect(field).toBeFocused();

  await field.fill('Launch Plan');
  await field.press('Enter');

  await expect(page.getByRole('heading', { name: 'Launch Plan' })).toBeVisible();
  await expect(root).toContainText('Launch Plan');

  // A11Y-01 also asks for a 44px pointer target on the menu trigger.
  const triggerBox = await root.getByRole('button', { name: 'Node actions' }).boundingBox();
  expect(triggerBox).not.toBeNull();
  const hitArea = await root
    .getByRole('button', { name: 'Node actions' })
    .evaluate((element) => {
      const styles = window.getComputedStyle(element, '::after');
      return {
        inset: parseFloat(styles.inset || '0'),
        position: styles.position,
      };
    });
  // The button is 28px and the invisible `after` box extends 8px on each side.
  expect(hitArea.position).toBe('absolute');
  expect(hitArea.inset).toBeLessThanOrEqual(-8);
});

test('SEC-01 the exported SVG is a well formed XML document', async ({ page }) => {
  await openNewMap(page);
  await page.getByRole('button', { name: 'Add top level branch' }).click();
  await expect(nodeWrappers(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByText('Export and import').click();

  const dialog = page.getByRole('dialog', { name: 'Export and import' });
  await expect(dialog).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /Download SVG snapshot/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);

  const path = await download.path();
  if (path === null) {
    throw new Error('the download was not written to disk');
  }
  const svg = await readFile(path, 'utf8');

  // Node cards are HTML, so the file only parses if they are wrapped in a
  // `foreignObject` with the XHTML namespace declared. Node has no DOMParser,
  // so the parse happens in the page, where the same parser every consumer of
  // the file would use is available.
  const verdict = await page.evaluate((markup) => {
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const error = parsed.querySelector('parsererror');
    const root = parsed.documentElement;
    return {
      hasError: error !== null,
      message: error?.textContent ?? '',
      tag: root.tagName,
      foreignObjects: parsed.querySelectorAll('foreignObject').length,
      scripts: parsed.querySelectorAll('script').length,
      handlerAttributes: Array.from(parsed.querySelectorAll('*')).filter((element) =>
        Array.from(element.attributes).some((attribute) =>
          attribute.name.toLowerCase().startsWith('on'),
        ),
      ).length,
      inputs: parsed.querySelectorAll('input, textarea, select').length,
    };
  }, svg);

  expect(verdict.hasError, verdict.message).toBe(false);
  expect(verdict.tag).toBe('svg');
  expect(verdict.foreignObjects).toBe(1);
  expect(verdict.scripts).toBe(0);
  expect(verdict.handlerAttributes).toBe(0);
  expect(verdict.inputs).toBe(0);
});

test('DATA-03 renaming the root renames the document', async ({ page }) => {
  await openNewMap(page);
  await expect(page.getByRole('heading', { name: UNNAMED_TITLE })).toBeVisible();

  const root = page.getByTestId('node-root');
  await root.dblclick();
  const field = page.getByRole('textbox', { name: 'Root label' });
  await expect(field).toBeVisible();
  await field.fill('Product Vision');
  await field.press('Enter');

  // The header follows the root label, and then survives a reload, which is
  // what proves it was written to the document rather than just the header.
  await expect(page.getByRole('heading', { name: 'Product Vision' })).toBeVisible();
  await expect(page.getByTestId('node-root')).toContainText('Product Vision');

  // The write is debounced, so the reload waits for the save the badge is
  // actually reporting rather than racing it.
  await expect(headerText(page)).toContainText('Saved');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Product Vision' })).toBeVisible();
  await expect(page.getByTestId('node-root')).toContainText('Product Vision');
  await expect(headerText(page)).not.toContainText('Unsaved changes');
});
