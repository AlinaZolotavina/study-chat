import ru from '@/locales/ru.json';

export const EQUATION = ru.agent.equation.expression;
export const EQUATION_CHECK = ru.agent.equation.check;
export const EQUATION_CHECK_DETAIL = ru.agent.equation.checkDetail;

function stepAnswer(step: '1' | '2' | '3' | '4') {
  return ru.agent.equation.steps[step].answer
    .replace('{equation}', EQUATION)
    .replace('{check}', EQUATION_CHECK);
}

export const EQUATION_STEPS = {
  1: {
    answer: stepAnswer('1'),
    detail: ru.agent.equation.steps['1'].detail,
  },
  2: {
    answer: stepAnswer('2'),
    detail: ru.agent.equation.steps['2'].detail,
  },
  3: {
    answer: stepAnswer('3'),
    detail: ru.agent.equation.steps['3'].detail,
  },
  4: {
    answer: stepAnswer('4'),
  },
} as const;
