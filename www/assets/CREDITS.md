# Crédits des modèles 3D, textures et ciel

Tous les modèles de `assets/models/`, les textures de `assets/textures/` et le ciel HDRI sont
sous licence **CC0 1.0** (domaine public, https://creativecommons.org/publicdomain/zero/1.0/).
Aucune attribution n'est exigée ; on la donne quand même, par gratitude. Les modèles sans
texture reçoivent à l'exécution les couleurs douces de l'archipel (`js/world.js`).

## Modèles

| Fichier | Modèle | Auteur | Licence | Source |
|---|---|---|---|---|
| `models/megakit/*.glb` | Stylized Nature MegaKit (version Standard gratuite) : CommonTree_3, CommonTree_5, Pine_5, TwistedTree_1, Bush_Common, Bush_Common_Flowers, Grass_Common_Short, Grass_Common_Tall, Flower_3_Group, Flower_3_Single, Clover_1, Plant_1, Plant_7_Big, Fern_1, Rock_Medium_1/2/3, Pebble_Round_1/2/3, Pebble_Square_1/2/3/4 | Quaternius (quaternius.com) | CC0 (fichier `License_Standard.txt` du pack) | https://opengameart.org/content/stylized-nature-megakit (archive `stylized_nature_megakitstandard.zip`) — aussi sur https://quaternius.com/packs/stylizednaturemegakit.html |
| `models/hero.glb` | Ulysse, assemblé à partir de trois packs : **Universal Base Characters** (tête, yeux, sourcils, jambes nues du « Superhero_Male », coiffure Hair_SimpleParted, Hair_Beard), **Modular Character Outfits – Fantasy** (tenue Male_Peasant : tunique, pantalon, bottes, mains), **Universal Animation Library** (clips Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Interact, Spell_Simple_Idle_Loop, rotations seules) — même squelette « Humanoid » à 65 os | Quaternius (quaternius.com) | CC0 (fichiers `License_Standard.txt` / `License.txt` des packs) | https://quaternius.itch.io/universal-base-characters · https://quaternius.itch.io/modular-character-outfits-fantasy · https://quaternius.itch.io/universal-animation-library (versions Standard gratuites). Assemblage, recadrage des textures (JPEG ≤ 1024 px) et niveaux de gris teintables : script `pack_hero.py` (hors dépôt). Les pièces grecques (cuirasse, ptéruges, casque, laurier, armes, bouclier) sont générées par `js/world.js`. |
| `models/hero_kaykit.glb` | Ulysse (style dessin animé) : personnage **Barbarian** de l'**Adventurers Character Pack 1.0** (corps, tête barbue, cape, palette `barbarian_texture`), sans le bonnet d'ours ni les armes ; clips Idle, Walking_A, Running_A, Cheer | Kay Lousberg (KayKit, www.kaylousberg.com) | CC0 (fichier `LICENSE.txt` du pack) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (`Characters/gltf/Barbarian.glb`) — aussi sur https://kaylousberg.itch.io/kaykit-adventurers. Allégé (animations et maillages inutiles retirés) par un petit script Python hors dépôt. Les boucles de cheveux, coiffes, armes et bouclier sont générés par `js/world.js`, qui repeint aussi la palette (garde-robe). |
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
| `../vendor/lottie_light.min.js` | lottie-web 5.12.2, build « light » (rendu SVG seul), © 2015 Bodymovin / Airbnb | MIT (texte : `../vendor/lottie-web.LICENSE.txt`) | https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie_light.min.js |

## Interface (UI v4)

Une ligne « Crédits » figure dans les réglages (`index.html`), comme l'exige la licence CC BY de game-icons.net.

| Fichier | Contenu | Auteur | Licence | Source |
|---|---|---|---|---|
| `ui/phosphor/*-duotone.svg`, assemblés dans `ui/icons.svg` (symboles `i-*`) | Phosphor Icons 2.1.1, style duotone : brain, gear-six, squares-four, compass, crosshair, caret-left/right, play, question, arrow-counter-clockwise, eraser, lightbulb, arrow-right, share-network, lock-simple, square, x, star, speaker-high, music-notes, vibrate, text-aa, circle-half, sparkle, eye, check, arrow-clockwise | © 2023 Phosphor Icons (Helena Zhang, Tobias Fried) | MIT (texte : `ui/phosphor/LICENSE.txt`) | https://unpkg.com/@phosphor-icons/core@2/assets/duotone/ — https://phosphoricons.com |
| `ui/game-icons/laurels.svg` (symbole `g-laurels`) | Laurels (couronne de laurier, fin de niveau) | Lorc | CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/ | https://game-icons.net/1x1/lorc/laurels.html |
| `ui/game-icons/greek-temple.svg` (symbole `g-greek-temple`) | Greek temple (en-tête de la liste des mini-jeux) | Delapouite | CC BY 3.0 | https://game-icons.net/1x1/delapouite/greek-temple.html |
| `ui/lottie/success-burst.json` | Éclat doré de fin de niveau (anneau, rayons, étincelles) | animation créée pour Odysseus (fichier généré, aucune source tierce) | même licence que le jeu | — |
| `fonts/marcellus-latin-400.woff2` | Marcellus (titres) | Brian J. Bonislawsky (Astigmatic) | SIL OFL 1.1 (texte : `fonts/OFL-Marcellus.txt`) | https://fonts.google.com/specimen/Marcellus via https://cdn.jsdelivr.net/npm/@fontsource/marcellus@5 |
| `fonts/cinzel-latin-500.woff2`, `fonts/cinzel-latin-600.woff2` | Cinzel (capitales : intro, étiquettes) | Natanael Gama | SIL OFL 1.1 (texte : `fonts/OFL-Cinzel.txt`) | https://fonts.google.com/specimen/Cinzel via https://cdn.jsdelivr.net/npm/@fontsource/cinzel@5 |
| `fonts/jost-latin-300/400/500/600.woff2` | Jost (texte courant) | Owen Earl (indestructible type*) | SIL OFL 1.1 (texte : `fonts/OFL-Jost.txt`) | https://fonts.google.com/specimen/Jost via https://cdn.jsdelivr.net/npm/@fontsource/jost@5 |

Le grain et les veines de marbre des feuilles sont générés en CSS (filtres SVG `feTurbulence` dans `css/style.css`) : aucune image tierce.
Kenney UI Pack (CC0) a été examiné mais pas retenu : son style « jeu mobile » cadre mal avec l'esthétique grecque calme.
