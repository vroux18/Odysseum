# Crédits des modèles 3D, textures et ciel

Tous les modèles de `assets/models/`, les textures de `assets/textures/` et le ciel HDRI sont
sous licence **CC0 1.0** (domaine public, https://creativecommons.org/publicdomain/zero/1.0/).
Aucune attribution n'est exigée ; on la donne quand même, par gratitude. Les modèles sans
texture reçoivent à l'exécution les couleurs douces de l'archipel (`js/world.js`).

## Modèles

| Fichier | Modèle | Auteur | Licence | Source |
|---|---|---|---|---|
| `models/megakit/*.glb` | Stylized Nature MegaKit (version Standard gratuite) : CommonTree_3, CommonTree_5, Pine_5, TwistedTree_1, Bush_Common, Bush_Common_Flowers, Grass_Common_Short, Grass_Common_Tall, Flower_3_Group, Flower_3_Single, Clover_1, Plant_1, Plant_7_Big, Fern_1, Rock_Medium_1/2/3, Pebble_Round_1/2/3, Pebble_Square_1/2/3/4 | Quaternius (quaternius.com) | CC0 (fichier `License_Standard.txt` du pack) | https://opengameart.org/content/stylized-nature-megakit (archive `stylized_nature_megakitstandard.zip`) — aussi sur https://quaternius.com/packs/stylizednaturemegakit.html |
| `models/man.glb` | Man (animé : Idle, Walk, Run…) | Quaternius | CC0 | https://static.poly.pizza/3746be88-6799-4817-929b-6bc067c47caa.glb (poly.pizza) |
| `models/column.glb` | Column | Quaternius / Kay Lousberg (poly.pizza) | CC0 | https://static.poly.pizza/5239f88f-e30b-452b-a19e-89745d580b1e.glb |
| `models/column_round.glb` | Column Round | Quaternius / Kay Lousberg (poly.pizza) | CC0 | https://static.poly.pizza/105dfd4b-6af3-4732-8c29-a89b15135b07.glb |
| `models/arch.glb` | Arch | Kay Lousberg (KayKit, Halloween Bits) | CC0 | https://static.poly.pizza/482206a2-7c47-4edb-8d6e-d6d8cd55e6cf.glb |
| `models/sailboat.glb` | Sail Boat | Quaternius (poly.pizza) | CC0 | https://static.poly.pizza/b1d42c7e-152a-4d56-a754-cca000a5abad.glb |
| `models/nature/*.glb` | Nature Kit 2.1 : tree_palmDetailedTall, tree_palmBend | Kenney (www.kenney.nl) | CC0 | https://kenney.nl/assets/nature-kit |

Les modèles du MegaKit ont été réempaquetés en `.glb` allégés (`pack.py`, hors dépôt) :
géométrie, UV et occlusion des sommets conservées, images retirées (chargées à part ci-dessous).

## Textures (`assets/textures/`)

| Fichier | Origine | Auteur | Licence |
|---|---|---|---|
| `bark.jpg`, `bark_twisted.jpg` | Bark_NormalTree / Bark_TwistedTree (2048 → 256 px) | Quaternius, Stylized Nature MegaKit | CC0 |
| `leaves_tree.png`, `leaves_pine.png`, `leaves_twisted.png`, `leaves.png`, `flowers.png`, `grass.png` | Leaves_NormalTree_C, Leaf_Pine_C, Leaves_TwistedTree (masque blanc, teinté en jeu), Leaves, Flowers, Grass (réduits à 256–512 px, couleurs étendues sous l'alpha) | Quaternius, Stylized Nature MegaKit | CC0 |
| `rocks_desert.jpg`, `pathrocks.jpg` | Rocks_Desert_Diffuse, PathRocks_Diffuse (512 px) | Quaternius, Stylized Nature MegaKit | CC0 |
| `limestone.jpg` | dérivé de Rocks_Desert_Diffuse (désaturé, éclairci : calcaire) | Quaternius, Stylized Nature MegaKit | CC0 |
| `sky.hdr` | « Kloofendal 48d Partly Cloudy (Pure Sky) », réduit à 256×128, hémisphère bas remplacé par une lumière de rebond chaude | Greg Zaal (original) et Jarod Guest (ciel), Poly Haven | CC0 — https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky (fichier https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr) |

## Code tiers (`vendor/`)

| Fichier | Auteur | Licence | Source |
|---|---|---|---|
| `../vendor/GLTFLoader.js` | auteurs de three.js (r128, examples/js) | MIT | https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js |
| `../vendor/RGBELoader.js` | auteurs de three.js (r128, examples/js) | MIT | https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/RGBELoader.js |
