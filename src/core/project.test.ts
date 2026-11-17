import { describe, expect, it } from 'vitest';
import { addVersion, createSprite, currentVersion, MAX_VERSIONS, parseBackup } from './project';

describe('projetos e versões', () => {
  it('não duplica versão igual e guarda a nova como atual', () => {
    let s = createSprite('p1', 'Herói', '2x2:AAAA', 'gerado', 1);
    expect(addVersion(s, '2x2:AAAA', 'editado', 2)).toBe(s);
    s = addVersion(s, '2x2:BBBB', 'editado', 3);
    expect(s.versions).toHaveLength(2);
    expect(currentVersion(s).image).toBe('2x2:BBBB');
    expect(s.updatedAt).toBe(3);
  });

  it('limita o histórico preservando a versão de origem', () => {
    let s = createSprite('p1', 'x', '1x1:0', 'gerado', 0);
    for (let i = 1; i <= MAX_VERSIONS + 10; i++) s = addVersion(s, `1x1:${i}`, 'editado', i);
    expect(s.versions).toHaveLength(MAX_VERSIONS);
    expect(s.versions[0].image).toBe('1x1:0');
    expect(currentVersion(s).image).toBe(`1x1:${MAX_VERSIONS + 10}`);
  });

  it('importa backup com ids novos e recusa arquivo estranho', () => {
    const sprite = createSprite('old', 'a', '1x1:AAAAAA==', 'gerado');
    const text = JSON.stringify({
      format: 'sprite-forge-project', version: 1, exportedAt: '',
      project: { id: 'old', name: 'Chapuleto', palette: { id: 'x', name: 'x', colors: ['#000000'] }, locked: true, gridW: 32, gridH: 32, createdAt: 0, updatedAt: 0 },
      sprites: [sprite],
    });
    const b = parseBackup(text);
    expect(b.project.id).not.toBe('old');
    expect(b.sprites[0].projectId).toBe(b.project.id);
    expect(b.sprites[0].id).not.toBe(sprite.id);
    expect(() => parseBackup('{"format":"outro"}')).toThrow(/backup/);
    expect(() => parseBackup('nada')).toThrow(/JSON/);
  });
});
