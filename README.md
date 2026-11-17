# Sprite Forge 16-bit

Ferramenta pessoal para gerar sprites em pixel art 16-bit com grade exata, paleta travada por projeto e editor de pixels integrado.

## O que faz

- **Gerar**: cria sprites a partir de texto (Pollinations com chave pessoal `sk_`, ou demonstração offline).
- **Converter**: transforma uma imagem de referência em pixel art na grade escolhida (16, 24, 32 ou 64 px), com paleta DB32, Game Boy, NES, PICO-8, SNES 15-bit ou extraída da imagem.
- **Editor**: lápis, borracha, balde, conta-gotas, seleção, espelho, inversão e desfazer/refazer.

Todo resultado passa por uma verificação automática: nenhum pixel semitransparente e nenhuma cor fora da paleta.

## Rodar no computador

```bash
npm.cmd install
npm.cmd run dev
```

Ou dê dois cliques em `iniciar.cmd` (use `iniciar.cmd celular` para abrir também no celular na mesma rede Wi-Fi).

## Chave de API

A chave do Pollinations é digitada no próprio app e fica guardada só no navegador de cada aparelho. Ela nunca vai para este repositório.

## Publicação

Cada push na branch `main` roda os testes, gera o build e publica no GitHub Pages (`.github/workflows/deploy.yml`).
