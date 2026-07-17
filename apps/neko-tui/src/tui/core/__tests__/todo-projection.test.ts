import { describe, expect, it } from 'vitest';
import { deriveTodoProjection, MAX_PROJECTED_TODOS } from '../todo-projection';

describe('deriveTodoProjection', () => {
  it('projects bounded checklist state only from a TODO section', () => {
    const markdown = `
- [x] ordinary checklist stays in prose

## 近期 TODO

- [x] inspect the first generated image
- [-] generate the approved repair
- [ ] review the repair
- [!] delivery capability unavailable

## Result

- [x] result checklist also stays in prose
`;

    expect(deriveTodoProjection(markdown)).toEqual([
      { content: 'inspect the first generated image', status: 'completed' },
      { content: 'generate the approved repair', status: 'in_progress' },
      { content: 'review the repair', status: 'pending' },
      { content: 'delivery capability unavailable', status: 'blocked' },
    ]);
  });

  it('enforces one in-progress item and the projection bound', () => {
    const lines = Array.from({ length: MAX_PROJECTED_TODOS + 2 }, (_, index) =>
      `- [-] item ${index + 1}`,
    );
    const result = deriveTodoProjection(`## TODO\n${lines.join('\n')}`);

    expect(result).toHaveLength(MAX_PROJECTED_TODOS);
    expect(result.filter((item) => item.status === 'in_progress')).toHaveLength(1);
    expect(result.slice(1).every((item) => item.status === 'pending')).toBe(true);
  });

  it('projects an ordinary Markdown table under a TODO heading', () => {
    expect(
      deriveTodoProjection(`
## 近期 TODO

| 状态 | TODO |
|---|---|
| 已完成 | 等待并接收异步生成结果 |
| 进行中 | 检查构图与动作 |
| 待评审 | 检查明显瑕疵 |
| 阻塞 | 等待导出能力 |
| 已确认 | 仅写入 generated 输出 |
`),
    ).toEqual([
      { content: '等待并接收异步生成结果', status: 'completed' },
      { content: '检查构图与动作', status: 'in_progress' },
      { content: '检查明显瑕疵', status: 'pending' },
      { content: '等待导出能力', status: 'blocked' },
      { content: '仅写入 generated 输出', status: 'completed' },
    ]);
  });
});
