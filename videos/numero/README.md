# "Nesse mundo, todo mundo tem um número em cima da cabeça"

Vídeo viral vertical (1080x1920, cerca de 80 s) em **3D**, com personagens em blocos no estilo dos jogos de blocos. Todos os modelos são originais e gerados por código.

**Lição:** *Não importa quantas pessoas te seguem. Importa quantas ficam quando você cai. Seja o 1 de alguém.*

- `o_numero_em_cima_da_cabeca.mp4`: vídeo final
- `legendas.srt`: legendas
- `engine3d.py`: mini motor 3D em OpenGL (moderngl). Tem sol, sombras, céu, neblina, rostos e "studs" procedurais e funciona sem GPU (Mesa llvmpipe).
- `world.py`: personagens articulados em blocos e o cenário da escola
- `make_video.py`: roteiro, câmeras, animação, narração (voz neural Piper `pt_BR-faber-medium`) e mixagem

Personagens: João (narrador), Lucas, Bia, Isabella, Ivna, Rayane, Jesus, Mateus, Adrielly e Levi. O nome de cada um aparece acima do número.

```bash
pip install moderngl piper-tts numpy pillow   # e ffmpeg; no Linux também libegl1 e libegl-mesa0
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-faber-medium.tar.bz2
tar xjf vits-piper-pt_BR-faber-medium.tar.bz2
python3 make_video.py --voice-dir vits-piper-pt_BR-faber-medium --out out/
```

Usa as funções de legenda, trilha e efeitos de `../superpoder/make_video.py`.
