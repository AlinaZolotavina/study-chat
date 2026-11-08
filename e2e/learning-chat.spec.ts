import { expect, test, type Page } from '@playwright/test';
import type { ChatsState } from '../src/features/chat/model/types';

interface ImageStage {
  phase: string;
  pixels: number;
  filter: string | null;
  opacity: number | null;
  duration: string | null;
  keyframes: { filter: string; opacity: string }[];
  loaded: boolean;
  interactive: boolean;
  completed: boolean;
}

declare global {
  interface Window {
    __lomImageStages: ImageStage[];
  }
}

async function savedChat(page: Page) {
  const chats = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('lom-ai:chat') ?? 'null') as ChatsState,
  );
  const chat = chats.byId[chats.selectedChatId];
  if (!chat) throw new Error('Expected the selected chat to be saved');
  return chat;
}

test('E2E-01: Newton, image failure and Retry, simplification and reload', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Record short CSS stages as they happen, rather than trying to catch them
  // through polling or changing the app's animation speed for the test.
  await page.addInitScript(() => {
    window.__lomImageStages = [];
    let previous: string | undefined;
    const observer = new MutationObserver(() => {
      const frame = document.querySelector<HTMLElement>('[data-image-phase]');
      const phase = frame?.dataset.imagePhase;
      if (!frame || !phase || phase === previous) return;
      previous = phase;
      const image = frame.querySelector('img');
      const style = image ? getComputedStyle(image) : null;
      const opener = frame.querySelector('button');
      const status = frame
        .closest('article')
        ?.querySelector('button[aria-controls]');
      window.__lomImageStages.push({
        phase,
        pixels: frame.querySelectorAll('[aria-hidden="true"] > span').length,
        filter: style?.filter ?? null,
        opacity: style ? Number(style.opacity) : null,
        duration: style?.animationDuration ?? null,
        keyframes:
          image?.getAnimations().flatMap((animation) =>
            animation.effect instanceof KeyframeEffect
              ? animation.effect.getKeyframes().map((frame) => ({
                  filter: String(frame.filter),
                  opacity: String(frame.opacity),
                }))
              : [],
          ) ?? [],
        loaded: !!image?.complete && image.naturalWidth > 0,
        interactive: !!opener && !opener.disabled,
        completed: status?.textContent?.startsWith('Думал ') ?? false,
      });
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-image-phase'],
    });
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'С чем нужна помощь?' }),
  ).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Сообщение', exact: true });
  const history = page.getByRole('region', { name: 'История диалога' });
  const messages = history.getByRole('article');
  const suggestions = page.getByRole('group', { name: 'Можешь продолжить' });
  const newton = 'Объясни второй закон Ньютона';
  const draft = 'Мой следующий вопрос';

  await test.step('Explain Newton and send the image suggestion without losing the draft', async () => {
    await input.fill(newton);
    await page
      .getByRole('button', { name: 'Отправить сообщение', exact: true })
      .click();
    await expect(messages).toHaveCount(2);
    await expect(messages.nth(1)).toContainText('F = m · a');
    await expect(suggestions.getByRole('button')).toHaveText([
      'Объясни проще',
      'Покажи схему',
      'Приведи пример из жизни',
    ]);
    await input.fill(draft);
    await suggestions
      .getByRole('button', { name: 'Покажи схему', exact: true })
      .click();
    await expect(messages).toHaveCount(4);
    await expect(input).toHaveValue(draft);
    await expect(suggestions).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Остановить ответ', exact: true }),
    ).toBeVisible();
  });

  const diagram = messages.nth(3);
  const frame = diagram.locator('[data-image-phase]');
  const image = diagram.getByRole('img');
  const retry = diagram.getByRole('button', {
    name: 'Повторить ответ на последний вопрос',
    exact: true,
  });
  await test.step('Show the built-in image failure with no image or successful tool action', async () => {
    await expect(
      frame.getByText('Создаю изображение…', { exact: true }),
    ).toBeVisible();
    await expect(diagram).toContainText(
      'Не удалось завершить ответ. Попробуй ещё раз.',
    );
    await expect(retry).toBeVisible();
    await expect(image).toHaveCount(0);
    await expect(diagram).not.toContainText(
      'Использовал генератор изображений',
    );
    await expect(input).toHaveValue(draft);
  });

  const failed = await savedChat(page);
  const failedAnswer = failed.messages.at(-1);
  if (failedAnswer?.role !== 'assistant')
    throw new Error('Expected the failed image answer');
  expect(failedAnswer.run.status).toBe('failed');

  await test.step('Retry the same pair and observe all four animation stages', async () => {
    await page.evaluate(() => {
      window.__lomImageStages.length = 0;
    });
    await retry.click();
    await expect(
      frame.getByText('Создаю изображение…', { exact: true }),
    ).toBeVisible();
    await expect(
      diagram.getByRole('button', { name: /^Думал / }),
    ).toBeVisible();
    await expect(frame).toHaveAttribute('data-image-phase', 'ready');
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS('filter', 'none');
    await expect(image).toHaveCSS('opacity', '1');
    await expect(
      diagram.getByRole('button', {
        name: 'Открыть изображение в полном размере',
        exact: true,
      }),
    ).toBeEnabled();

    const stages = await page.evaluate(() => window.__lomImageStages);
    expect(stages.map((stage) => stage.phase)).toEqual([
      'blur',
      'particles',
      'fading',
      'revealing',
      'ready',
    ]);
    expect(
      stages.find((stage) => stage.phase === 'particles')?.pixels,
    ).toBeGreaterThan(0);
    expect(
      stages.find((stage) => stage.phase === 'fading')?.pixels,
    ).toBeGreaterThan(0);
    const revealing = stages.find((stage) => stage.phase === 'revealing');
    expect(revealing).toMatchObject({
      pixels: 0,
      duration: '1.2s',
      loaded: true,
      interactive: false,
      completed: true,
    });
    expect(revealing?.keyframes).toEqual([
      { filter: 'blur(16px)', opacity: '0.25' },
      { filter: 'blur(0px)', opacity: '1' },
    ]);
    expect(revealing?.filter).toMatch(/^blur\(/);
    expect(revealing?.opacity).toBeGreaterThan(0);
    expect(revealing?.opacity).toBeLessThan(1);

    const successful = await savedChat(page);
    const answer = successful.messages.at(-1);
    if (answer?.role !== 'assistant')
      throw new Error('Expected the image answer');
    expect(successful.messages.map((message) => message.id)).toEqual(
      failed.messages.map((message) => message.id),
    );
    expect(answer.run.id).not.toBe(failedAnswer.run.id);
    expect(answer.run.attempt).toBe(failedAnswer.run.attempt + 1);
    expect(answer.run.status).toBe('completed');
    expect(answer.text).toBe('');
    expect(answer.imageSrc).toBe('assets/newtons-2nd-law-of-motion.png');
    await expect(input).toHaveValue(draft);
  });

  const execution = diagram.getByRole('button', { name: /^Думал / });
  const actionList = diagram.getByRole('list', {
    name: 'Выполненные действия',
  });
  const actions = [
    'Проанализировал запрос',
    'Использовал генератор изображений',
    'Сформировал ответ',
  ];
  await execution.click();
  await expect(execution).toHaveAttribute('aria-expanded', 'true');
  await expect(actionList.getByRole('listitem')).toHaveText(actions);
  const duration = await execution.innerText();

  await test.step('Simplify Newton and offer only the remaining suggestion', async () => {
    await suggestions
      .getByRole('button', { name: 'Объясни проще', exact: true })
      .click();
    await expect(messages).toHaveCount(6);
    await expect(messages.last()).toContainText('тележку');
    await expect(suggestions.getByRole('button')).toHaveText([
      'Приведи пример из жизни',
    ]);
    await expect(
      messages.last().getByRole('group', { name: 'Можешь продолжить' }),
    ).toBeVisible();
    await expect(input).toHaveValue(draft);
  });

  const saved = await savedChat(page);
  await test.step('Restore the conversation and show the image sharply without replaying animation', async () => {
    await page.reload();
    await expect(messages).toHaveCount(6);
    await expect(
      history.getByRole('article', { name: 'Вы', exact: true }).locator('p'),
    ).toHaveText([newton, 'Покажи схему', 'Объясни проще']);
    await expect(messages.nth(1)).toContainText('F = m · a');
    await expect(messages.last()).toContainText('тележку');
    await expect(input).toHaveValue(draft);
    await expect(suggestions.getByRole('button')).toHaveText([
      'Приведи пример из жизни',
    ]);
    await expect(frame).toHaveAttribute('data-image-phase', 'ready');
    await expect(
      diagram.getByRole('button', {
        name: 'Открыть изображение в полном размере',
        exact: true,
      }),
    ).toBeEnabled();
    await expect(image).toHaveCSS('filter', 'none');
    await expect(image).toHaveCSS('opacity', '1');
    await expect(image).toHaveCSS('animation-name', 'none');
    expect(
      await page.evaluate(() =>
        window.__lomImageStages.map((stage) => stage.phase),
      ),
    ).toEqual(['ready']);
    await expect(execution).toHaveAttribute('aria-expanded', 'true');
    await expect(execution).toHaveText(duration);
    await expect(actionList.getByRole('listitem')).toHaveText(actions);
    expect(await savedChat(page)).toEqual(saved);
  });
  expect(pageErrors).toEqual([]);
});
