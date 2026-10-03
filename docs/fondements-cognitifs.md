# Odysseum — Fondements cognitifs des capacités affichées

*Document de travail. Recherche documentaire réalisée en octobre 2026. Toutes les références de la bibliographie ont été vérifiées en ligne (auteurs, année, revue, DOI ou URL). Si une information n'a pas pu être confirmée, c'est indiqué.*

---

## 0. Avertissement de méthode

1. **Aucune étude ne porte sur les mini-jeux d'Odysseum eux-mêmes.** Le rattachement de chaque jeu à des processus cognitifs repose sur une **analyse de tâche** : on décrit ce que la règle du jeu oblige le joueur à faire, puis on rapproche ces opérations de construits décrits dans la littérature (fonctions exécutives, raisonnement fluide, traitement visuo-spatial, planification, test d'hypothèses). Quand un casse-tête équivalent a été étudié directement (Mastermind, Sudoku, Tour de Londres, problème du voyageur de commerce), c'est signalé.
2. **« Solliciter » n'est pas « entraîner durablement ».** Le fait qu'un jeu mobilise un processus ne prouve pas que jouer améliore ce processus en dehors du jeu (voir section C).
3. Les résultats de **complexité algorithmique** (NP-complétude, algèbre linéaire) cités ci-dessous décrivent la *structure logique* des puzzles. Ils ne disent rien, en eux-mêmes, de la cognition humaine ; ils servent seulement à montrer qu'il s'agit de vrais problèmes de satisfaction de contraintes, non triviaux.

---

## 1. Cadres de référence retenus

### 1.1 Fonctions exécutives (Diamond, 2013 ; Miyake et al., 2000)

Diamond (2013, *Annual Review of Psychology*) distingue trois fonctions exécutives de base — **inhibition** (contrôle de l'interférence et des réponses automatiques), **mémoire de travail** (garder et manipuler des informations en tête) et **flexibilité cognitive** (changer de point de vue ou de stratégie) — à partir desquelles se construisent des fonctions de haut niveau : **raisonnement, résolution de problèmes et planification**. Ce découpage reprend le modèle « unité et diversité » de Miyake et al. (2000, *Cognitive Psychology*), qui a montré par analyse factorielle que la mise à jour (*updating*), l'inhibition et le changement de règle (*shifting*) sont corrélés mais séparables. La piste suggérée est donc **confirmée**.

### 1.2 Théorie CHC (Cattell-Horn-Carroll)

La synthèse de référence est Schneider & McGrew (2018), chapitre de *Contemporary Intellectual Assessment* (4e éd.). Deux aptitudes larges sont pertinentes :
- **Gf, raisonnement fluide** : résoudre des problèmes nouveaux qu'on ne peut pas traiter par automatisme, notamment par induction et par raisonnement déductif (« raisonnement séquentiel général »).
- **Gv, traitement visuo-spatial** : percevoir, se représenter et manipuler mentalement des formes et des relations spatiales.

Carpenter, Just & Shell (1990) ont montré, sur les Matrices de Raven (test emblématique de Gf), que la difficulté tient en grande partie à la **gestion de buts** (garder plusieurs sous-objectifs en mémoire de travail) et à l'**abstraction de relations**. Halford, Wilson & Phillips (1998) proposent la **complexité relationnelle** (le nombre de relations à traiter simultanément) comme mesure de la charge cognitive — notion reprise explicitement par Lee et al. (2008) pour le Sudoku.

### 1.3 Planification

La **Tour de Londres** a été conçue par Shallice (1982) pour mesurer les troubles de la planification chez des patients frontaux : il faut atteindre une configuration cible en un minimum de coups, ce qui oblige à anticiper plusieurs mouvements. Kotovsky, Hayes & Simon (1985) ont montré, sur la Tour de Hanoï et ses isomorphes, que la difficulté d'un problème dépend surtout de la **charge en mémoire** et de la **représentation** des règles, pas seulement de la longueur de la solution.

### 1.4 Raisonnement déductif sur contraintes

Lee, Goodwin & Johnson-Laird (2008, *Thinking & Reasoning*) ont étudié la résolution du Sudoku : des personnes sans entraînement résolvent ces grilles par **déduction pure**, en acquérant spontanément des « tactiques » dont la difficulté croît avec le nombre de contraintes à combiner (complexité relationnelle). C'est le meilleur modèle empirique disponible pour les grilles logiques de type Reines, Astres et Pixels.

### 1.5 Test d'hypothèses

Wason (1960) a montré avec la tâche « 2-4-6 » que les adultes testent spontanément surtout des cas qui *confirment* leur hypothèse, au lieu de chercher à l'*éliminer*. Le Mastermind a été étudié directement comme jeu de déduction : rôle du raisonnement conditionnel (*modus tollens*) dans la découverte du code (Best, 2001) ; modèle logique de la difficulté de « Deductive Mastermind » testé auprès de plus de 37 000 enfants de 5 à 12 ans (Gierasimczuk, van der Maas & Raijmakers, 2013) ; développement du raisonnement déductif dans le Mastermind (Rothe et al., 2018, résumé de congrès).

### 1.6 Pensée spatiale

Newcombe & Shipley (2015) proposent une typologie 2 × 2 : **intrinsèque / extrinsèque** (forme d'un objet vs relations entre objets) et **statique / dynamique** (sans ou avec transformation mentale). La méta-analyse d'Uttal et al. (2013) montre par ailleurs que les compétences spatiales sont **entraînables** et que cet entraînement se transfère à d'autres tâches *spatiales* (effet moyen g ≈ 0,47) — c'est l'un des rares domaines où un transfert proche est solidement établi, sans que cela vaille pour un transfert lointain.

---

## A. Processus cognitifs sollicités, jeu par jeu

Légende : ●●● sollicitation centrale · ●● importante · ● secondaire (appréciation par analyse de tâche).

### 1. Flux (type Flow Free / Numberlink, avec ponts)
**Mécanique** : relier des paires de points de même couleur par des chemins qui ne se croisent pas (sauf aux ponts) et qui remplissent toute la grille.
- **Planification / anticipation ●●●** : un chemin tracé trop tôt peut bloquer une autre paire ; il faut prévoir l'occupation de l'espace avant de s'engager (rapprochement : Tour de Londres, Shallice 1982).
- **Traitement visuo-spatial ●●** (Gv ; relations *extrinsèques* entre trajets, Newcombe & Shipley 2015).
- **Raisonnement déductif ●●** : « cette case de coin ne peut être atteinte que par telle couleur ».
- **Mémoire de travail ●** et **flexibilité ●** (défaire et réorganiser un tracé).
- *Structure* : la variante « couvrir toute la grille » de Numberlink, popularisée par Flow Free, est NP-complète (Adcock et al., 2015).

### 2. Reines (type Queens / Star Battle)
**Mécanique** : une reine par ligne, par colonne et par région colorée, sans que deux reines se touchent (même en diagonale).
- **Raisonnement déductif sur contraintes ●●●** : élimination de cases, raisonnements du type « cette région n'occupe que deux colonnes, donc… » (même famille de tactiques que le Sudoku, Lee et al. 2008).
- **Mémoire de travail ●●** : combiner simultanément contraintes de ligne, colonne, région et voisinage (complexité relationnelle, Halford et al. 1998).
- **Inhibition ●** : résister à la pose « au hasard » tant qu'une déduction n'est pas faite.
- **Traitement visuo-spatial ●** (forme des régions).

### 3. Astres (type Takuzu / Binairo / Tango)
**Mécanique** : grille binaire soleils / lunes ; pas trois symboles identiques alignés ; autant de chaque par ligne et colonne ; contraintes « = » et « × » entre cases voisines.
- **Raisonnement déductif ●●●** : application de règles locales (paires, encadrement) puis de règles de comptage.
- **Mémoire de travail ●●** : propagation en chaîne des contraintes « = » / « × ».
- **Flexibilité cognitive ●** : passer d'une règle locale à une règle globale de comptage quand la première ne suffit plus.
- *Remarque* : pas d'étude cognitive spécifique trouvée sur le Takuzu ; le rattachement s'appuie sur l'analogie avec le Sudoku (Lee et al., 2008).

### 4. Pavés (Shikaku)
**Mécanique** : découper la grille en rectangles dont l'aire égale le nombre qu'ils contiennent.
- **Traitement visuo-spatial ●●●** : se représenter les rectangles possibles autour d'un nombre (pensée *intrinsèque* : forme et dimensions, Newcombe & Shipley 2015 ; Gv).
- **Raisonnement numérique ●●** : décompositions d'un nombre en produit (12 = 2 × 6 = 3 × 4…).
- **Raisonnement déductif ●●** : éliminer les rectangles qui empiètent sur un autre nombre ou laissent des cases orphelines.
- *Structure* : décider si une grille Shikaku a une solution est NP-complet (résultat attribué à Takenaga et al., 2013 — **non vérifié dans la source primaire**, non cité en bibliographie).

### 5. Pixels (nonogramme / Picross)
**Mécanique** : indices de blocs par ligne et par colonne ; les déductions révèlent un dessin.
- **Raisonnement déductif ●●●** : une ligne est un petit problème de contraintes (technique du « chevauchement » des blocs), résolu puis propagé aux colonnes.
- **Mémoire de travail ●●** : garder plusieurs placements possibles d'un bloc en tête.
- **Traitement visuo-spatial ●●** : placement de blocs dans un espace contraint, alternance lignes / colonnes, reconnaissance progressive de la figure.
- *Remarque* : la composante principale est déductive ; la composante spatiale est réelle mais secondaire. Le classement de Pixels dans « Espace » (actuel) est donc **discutable** (voir B).

### 6. Serpent (type Zip / Hidato)
**Mécanique** : tracer un chemin unique passant par toutes les cases (chemin hamiltonien) et par des nombres dans l'ordre.
- **Planification / anticipation ●●●** : chaque pas restreint les suivants ; il faut éviter les culs-de-sac et les zones isolées.
- **Traitement visuo-spatial ●●** : lecture de la géométrie de la grille (couloirs, coins). La littérature sur la résolution humaine du problème du voyageur de commerce montre que les personnes s'appuient sur des indices perceptifs globaux de la configuration (MacGregor & Ormerod, 1996) — rapprochement indirect.
- **Mémoire de travail ●** et **flexibilité ●** (retour en arrière).

### 7. Lumières (Lights Out)
**Mécanique** : chaque appui inverse une case et ses voisines ; il faut tout éteindre.
- **Raisonnement / résolution de problème ●●●** : comprendre l'effet combiné des appuis. Mathématiquement, le jeu est un système d'équations linéaires modulo 2 ; l'ordre des appuis n'a pas d'importance et appuyer deux fois revient à ne rien faire (Anderson & Feil, 1998).
- **Découverte de règles / test d'hypothèses ●●** : le joueur novice essaie, observe, puis induit des stratégies (par exemple « repousser » les lumières ligne par ligne).
- **Anticipation ●●** : prévoir l'effet d'un appui sur les cases voisines.
- **Inhibition ●** : renoncer à l'appui « évident » qui rallume autre chose.
- *Remarque* : **aucune étude de psychologie cognitive sur Lights Out n'a été trouvée** ; le rattachement repose sur l'analyse de tâche.

### 8. Coffre (Mastermind ; variante « plus haut / plus bas »)
**Mécanique** : déduire un code secret à partir de retours « bien placé / mal placé » ; variante avec indication « plus haut / plus bas » par chiffre.
- **Test d'hypothèses / raisonnement hypothético-déductif ●●●** : formuler une hypothèse, choisir l'essai le plus informatif, éliminer les codes incompatibles. Étudié directement : Best (2001) ; Gierasimczuk et al. (2013) ; Rothe et al. (2018). Le piège classique est le biais de confirmation décrit par Wason (1960).
- **Mémoire de travail ●●●** : intégrer les retours de tous les essais précédents (Gierasimczuk et al. utilisent le nombre d'étapes logiques comme indicateur de charge en mémoire de travail).
- **Raisonnement déductif ●●** (raisonnement conditionnel, *modus tollens*).
- La variante « plus haut / plus bas » sollicite surtout une **stratégie de recherche par dichotomie** (raisonnement plus simple, accessible aux plus jeunes).

### Tableau de synthèse

| Jeu | Déduction sur contraintes | Visuo-spatial | Planification | Test d'hypothèses | Mémoire de travail |
|---|---|---|---|---|---|
| Flux | ●● | ●● | ●●● | – | ● |
| Reines | ●●● | ● | – | – | ●● |
| Astres | ●●● | – | – | – | ●● |
| Pavés | ●● | ●●● | ● | – | ● |
| Pixels | ●●● | ●● | – | – | ●● |
| Serpent | ● | ●● | ●●● | – | ● |
| Lumières | ●● | ● | ●● | ●● | ●● |
| Coffre | ●● | – | ● | ●●● | ●●● |

La **mémoire de travail** est transversale (tous les jeux la sollicitent) : elle n'est pas proposée comme capacité affichée, car on ne peut pas l'isoler proprement d'un jeu à l'autre.

---

## B. Capacités proposées pour l'interface

### B.1 Évaluation du système actuel

| Actuel | Jeux | Verdict |
|---|---|---|
| Logique | Reines, Astres | **Défendable**, mais « Logique » et « Raisonnement » se recouvrent (la logique *est* une forme de raisonnement). Le terme « Déduction » est plus précis. |
| Espace | Pavés, Pixels | **Défendable pour Pavés.** Pour Pixels, la composante principale est déductive ; acceptable si l'on assume que chaque jeu est rangé dans une seule capacité « principale ». |
| Anticipation | Flux, Serpent | **Bien fondé** (planification, Shallice 1982 ; Diamond 2013). |
| Raisonnement | Lumières, Coffre | **Le construit est juste, le nom ne l'est pas** : ce qui réunit ces deux jeux, c'est d'*agir pour tester une idée et en tirer une conclusion* (test d'hypothèses). « Raisonnement » est trop général et englobe les trois autres. |

Conclusion : la répartition est **globalement défendable** ; le principal problème est le **vocabulaire** (deux noms quasi synonymes, Logique / Raisonnement). La proposition ci-dessous garde la structure 4 × 2, qui est équilibrée et lisible, et corrige les noms.

### B.2 Proposition (4 capacités)

| Capacité affichée | Jeux (contribution principale) | Construit de rattachement | Références clés |
|---|---|---|---|
| **Déduction** | Reines, Astres | Raisonnement déductif sur contraintes ; composante « raisonnement séquentiel général » de Gf | Lee, Goodwin & Johnson-Laird 2008 ; Schneider & McGrew 2018 ; Halford et al. 1998 |
| **Vision dans l'espace** (ou « Espace ») | Pavés, Pixels | Traitement visuo-spatial (Gv) ; pensée spatiale intrinsèque / statique | Schneider & McGrew 2018 ; Newcombe & Shipley 2015 ; Uttal et al. 2013 |
| **Anticipation** | Flux, Serpent | Planification (fonction exécutive de haut niveau) | Diamond 2013 ; Shallice 1982 ; Kotovsky, Hayes & Simon 1985 |
| **Hypothèses** (ou « Enquête ») | Coffre, Lumières | Test d'hypothèses / raisonnement hypothético-déductif ; résolution de problème par essai raisonné | Wason 1960 ; Best 2001 ; Gierasimczuk et al. 2013 |

Variantes possibles :
- Si l'on préfère que Pixels soit dans « Déduction » (plus exact), il faut alors un autre jeu en « Espace » : **Flux** est le meilleur candidat (relations spatiales entre trajets), mais « Anticipation » ne garderait que Serpent. **Recommandation : garder Pixels en Espace** et le justifier par la reconstruction d'une figure, tout en sachant que c'est le classement le plus fragile.
- **Lumières** pourrait aussi aller en « Anticipation » (prévoir l'effet des appuis). Le laisser en « Hypothèses » est cohérent tant que le jeu encourage l'expérimentation (essayer, observer, comprendre la règle).
- Une 5e capacité « Mémoire » n'est **pas recommandée** : tous les jeux la sollicitent, aucun ne l'isole, et c'est précisément le domaine où les promesses d'entraînement ont été le plus démenties (Melby-Lervåg et al., 2016).

---

## C. Limites : ce que dit la littérature sur l'« entraînement cérébral »

### C.1 Les faits établis

- **On progresse surtout dans ce qu'on pratique.** Owen et al. (2010, *Nature*) : 11 430 participants entraînés six semaines en ligne sur des tâches de raisonnement, mémoire, planification, attention et visuo-spatiales. Progrès nets sur les tâches entraînées, **aucun transfert** démontré vers des tâches non entraînées, même proches.
- **Revue de référence.** Simons et al. (2016, *Psychological Science in the Public Interest*) ont examiné l'ensemble des études citées par l'industrie : bonne preuve d'amélioration sur les tâches entraînées, peu de preuves d'amélioration sur des tâches voisines, et **peu ou pas de preuves** d'amélioration du fonctionnement cognitif au quotidien. Beaucoup d'études présentaient des faiblesses méthodologiques.
- **Le transfert lointain est rare.** Sala & Gobet (2017, 2019) : méta-analyses sur les échecs, la musique, l'entraînement de la mémoire de travail et les jeux vidéo — les effets sur la cognition générale ou les résultats scolaires sont proches de zéro, et diminuent quand la qualité des études augmente. Melby-Lervåg, Redick & Hulme (2016) : l'entraînement de la mémoire de travail améliore des tâches de mémoire de travail similaires, **pas** l'intelligence, la lecture ou l'arithmétique. Gathercole et al. (2019) interprètent ces gains comme l'apprentissage de **routines spécifiques** à la tâche.
- **Le transfert est une notion graduée.** Barnett & Ceci (2002) distinguent de nombreuses dimensions (domaine, contexte, délai, modalité…) : plus la situation cible est éloignée du jeu, moins le transfert est probable.
- **Nuance favorable mais limitée** : les compétences spatiales sont entraînables et le gain se transfère à d'autres tâches spatiales (Uttal et al., 2013). Cela ne permet pas de promettre un effet sur la réussite scolaire ou professionnelle.
- **Précédent réglementaire.** Le 5 janvier 2016, la Federal Trade Commission (États-Unis) a obtenu de Lumos Labs (Lumosity) 2 millions de dollars (sur un jugement de 50 millions suspendu) pour publicité trompeuse : allégations non étayées d'amélioration des performances au travail, à l'école et dans le sport, et de prévention du déclin cognitif, de la démence ou de la maladie d'Alzheimer.

### C.2 Ce qu'on peut honnêtement affirmer

- Chaque jeu **sollicite** (mobilise, fait travailler *pendant le jeu*) des processus identifiés par la recherche.
- Le joueur **progresse dans le jeu** (rapidité, taille des grilles, stratégies) — c'est mesurable et vrai.
- Ces jeux sont des **équivalents** de casse-têtes classiques (Sudoku, Mastermind, Tour de Londres…) étudiés en psychologie cognitive.
- Les jauges de capacités reflètent **la pratique et la réussite dans Odysseum**, pas un niveau cognitif mesuré.

### C.3 Formulations à utiliser

- « Ce jeu **sollicite** votre capacité de déduction. »
- « Ce jeu **fait appel à** l'anticipation. »
- « **Mobilise** : vision dans l'espace. »
- « Votre **pratique** en Déduction : 12 grilles résolues. »
- « Vous progressez **dans ce type de casse-tête**. »
- « Inspiré de casse-têtes étudiés en sciences cognitives. »
- « Un moment de réflexion, à votre rythme. »

### C.4 Formulations à éviter

- « Améliore / développe / booste / entraîne votre cerveau », « musclez vos neurones ».
- « Augmente votre QI », « rend plus intelligent ».
- « Améliore votre mémoire / concentration au quotidien », « meilleurs résultats à l'école ou au travail ».
- « Prévient le déclin cognitif, Alzheimer, la démence » (exactement le type d'allégation sanctionné par la FTC).
- « Cliniquement prouvé », « validé scientifiquement », « conçu par des neuroscientifiques » (sauf si c'est vrai et documenté).
- « Votre âge cérébral », « score cérébral », ou tout chiffre présenté comme une mesure de vos capacités réelles.
- « Niveau de logique : 87 % » (préférer un compteur de pratique ou de progression *dans le jeu*).

Suggestion de mention dans l'écran « À propos » : *« Les capacités affichées indiquent les processus que chaque casse-tête fait travailler pendant que vous jouez, d'après la recherche en sciences cognitives. Elles reflètent votre pratique dans Odysseum et ne constituent ni une mesure ni un entraînement de vos capacités intellectuelles. »*

---

## D. Phrases d'interface (une par capacité)

- **Déduction** — « Tirer des certitudes des règles, une case après l'autre, sans jamais deviner. »
- **Vision dans l'espace** — « Se représenter les formes et la place qu'elles occupent avant de les tracer. »
- **Anticipation** — « Prévoir plusieurs coups à l'avance pour ne pas se fermer de chemin. »
- **Hypothèses** — « Proposer une idée, l'éprouver, et retenir ce que chaque essai révèle. »

(Si les noms actuels sont conservés : *Logique* → phrase de Déduction ; *Espace* → phrase de Vision dans l'espace ; *Raisonnement* → phrase d'Hypothèses.)

---

## Bibliographie

Les références marquées [DOI] ont un DOI vérifié ; [URL] renvoie à une page vérifiée.

**Cadres théoriques**
- Diamond, A. (2013). Executive functions. *Annual Review of Psychology*, 64, 135–168. [DOI] https://doi.org/10.1146/annurev-psych-113011-143750
- Miyake, A., Friedman, N. P., Emerson, M. J., Witzki, A. H., Howerter, A., & Wager, T. D. (2000). The unity and diversity of executive functions and their contributions to complex "frontal lobe" tasks: A latent variable analysis. *Cognitive Psychology*, 41(1), 49–100. [DOI] https://doi.org/10.1006/cogp.1999.0734
- Schneider, W. J., & McGrew, K. S. (2018). The Cattell-Horn-Carroll theory of cognitive abilities. In D. P. Flanagan & E. M. McDonough (Eds.), *Contemporary intellectual assessment: Theories, tests, and issues* (4th ed., pp. 73–163). New York : Guilford Press. (Ouvrage, pas de DOI.)
- Carpenter, P. A., Just, M. A., & Shell, P. (1990). What one intelligence test measures: A theoretical account of the processing in the Raven Progressive Matrices Test. *Psychological Review*, 97(3), 404–431. [URL] https://kilthub.cmu.edu/articles/journal_contribution/What_one_intelligence_test_measures_A_theoretical_account_of_the_processing_in_the_Raven_Progressive_Matrices_Test/6619121
- Halford, G. S., Wilson, W. H., & Phillips, S. (1998). Processing capacity defined by relational complexity: Implications for comparative, developmental, and cognitive psychology. *Behavioral and Brain Sciences*, 21(6). [URL] https://www.cambridge.org/core/journals/behavioral-and-brain-sciences (pagination non vérifiée)

**Planification et résolution de problèmes**
- Shallice, T. (1982). Specific impairments of planning. *Philosophical Transactions of the Royal Society of London. B, Biological Sciences*, 298(1089), 199–209. [DOI] https://doi.org/10.1098/rstb.1982.0082
- Kotovsky, K., Hayes, J. R., & Simon, H. A. (1985). Why are some problems hard? Evidence from Tower of Hanoi. *Cognitive Psychology*, 17, 248–294. (DOI non vérifié.)
- MacGregor, J. N., & Ormerod, T. C. (1996). Human performance on the traveling salesman problem. *Perception & Psychophysics*, 58(4), 527–539. [URL] https://eprints.lancs.ac.uk/id/eprint/10580/ (notice institutionnelle ; DOI non vérifié)

**Raisonnement déductif et test d'hypothèses**
- Lee, N. Y. L., Goodwin, G. P., & Johnson-Laird, P. N. (2008). The psychological puzzle of Sudoku. *Thinking & Reasoning*, 14(4), 342–364. [URL] https://lab.cs.ru.nl/algemeen/images/5/52/Sudoku_-_psyych_behind.pdf (synthèse : https://www.bps.org.uk/research-digest/sudoku-puzzles-show-were-all-capable-deductive-reasoning)
- Wason, P. C. (1960). On the failure to eliminate hypotheses in a conceptual task. *Quarterly Journal of Experimental Psychology*, 12(3), 129–140. [DOI] https://doi.org/10.1080/17470216008416717
- Best, J. B. (2001). Conditional reasoning processes in a logical deduction game. *Thinking & Reasoning*, 7(3), 235–254. [URL] https://philpapers.org/rec/BESCRP (revue, volume et pages vérifiés ; initiales de l'auteur et DOI non confirmés)
- Gierasimczuk, N., van der Maas, H. L. J., & Raijmakers, M. E. J. (2013). An analytic tableaux model for Deductive Mastermind empirically tested with a massively used online learning system. *Journal of Logic, Language and Information*, 22(3), 297–314. [DOI] https://doi.org/10.1007/s10849-013-9177-5
- Rothe, A., Kachergis, G. E., Raijmakers, M. E. J., Kalish, C., Rau, M., Zhu, J., & Rogers, T. T. (2018). The development of deductive reasoning in Mastermind. *Proceedings of the 40th Annual Conference of the Cognitive Science Society* (résumé, p. 2889). [URL] https://research.vu.nl/en/publications/the-development-of-deductive-reasoning-in-mastermind/

**Pensée spatiale**
- Newcombe, N. S., & Shipley, T. F. (2015). Thinking about spatial thinking: New typology, new assessments. In J. S. Gero (Ed.), *Studying Visual and Spatial Reasoning for Design Creativity* (pp. 179–192). Dordrecht : Springer. [DOI] https://doi.org/10.1007/978-94-017-9297-4_10
- Uttal, D. H., Meadow, N. G., Tipton, E., Hand, L. L., Alden, A. R., Warren, C., & Newcombe, N. S. (2013). The malleability of spatial skills: A meta-analysis of training studies. *Psychological Bulletin*, 139(2) (pagination non vérifiée). [DOI] https://doi.org/10.1037/a0028446

**Structure mathématique des puzzles**
- Anderson, M., & Feil, T. (1998). Turning lights out with linear algebra. *Mathematics Magazine*, 71(4), 300–303. [URL] https://en.wikipedia.org/wiki/Lights_Out_(game) (référence bibliographique confirmée via plusieurs sources secondaires ; article sur JSTOR)
- Adcock, A., Demaine, E. D., Demaine, M. L., O'Brien, M. P., Reidl, F., Sánchez Villaamil, F., & Sullivan, B. D. (2015). Zig-Zag Numberlink is NP-complete. *Journal of Information Processing*, 23(3), 239–245. [URL] https://www.jstage.jst.go.jp/article/ipsjjip/23/3/23_239/_article — prépublication : https://arxiv.org/abs/1410.5845

**Limites de l'entraînement cérébral et transfert**
- Owen, A. M., Hampshire, A., Grahn, J. A., Stenton, R., Dajani, S., Burns, A. S., Howard, R. J., & Ballard, C. G. (2010). Putting brain training to the test. *Nature*, 465(7299), 775–778. [DOI] https://doi.org/10.1038/nature09042 — accès libre : https://pmc.ncbi.nlm.nih.gov/articles/PMC2884087
- Simons, D. J., Boot, W. R., Charness, N., Gathercole, S. E., Chabris, C. F., Hambrick, D. Z., & Stine-Morrow, E. A. L. (2016). Do "brain-training" programs work? *Psychological Science in the Public Interest*, 17(3), 103 et suiv. [DOI] https://doi.org/10.1177/1529100616661983 — présentation APS : https://www.psychologicalscience.org/publications/brain-training.html
- Sala, G., & Gobet, F. (2017). Does far transfer exist? Negative evidence from chess, music, and working memory training. *Current Directions in Psychological Science*, 26(6), 515–520. [DOI] https://doi.org/10.1177/0963721417712760
- Sala, G., & Gobet, F. (2019). Cognitive training does not enhance general cognition. *Trends in Cognitive Sciences*, 23(1), 9–20. [DOI] https://doi.org/10.1016/j.tics.2018.10.004
- Melby-Lervåg, M., Redick, T. S., & Hulme, C. (2016). Working memory training does not improve performance on measures of intelligence or other measures of "far transfer": Evidence from a meta-analytic review. *Perspectives on Psychological Science*, 11(4), 512–534. [DOI] https://doi.org/10.1177/1745691616635612
- Gathercole, S. E., Dunning, D. L., Holmes, J., & Norris, D. (2019). Working memory training involves learning new skills. *Journal of Memory and Language*, 105, 19–42. [URL] https://ueaeprints.uea.ac.uk/id/eprint/81775
- Barnett, S. M., & Ceci, S. J. (2002). When and where do we apply what we learn? A taxonomy for far transfer. *Psychological Bulletin*, 128(4), 612–637. [DOI] https://doi.org/10.1037/0033-2909.128.4.612
- Federal Trade Commission (5 janvier 2016). *Lumosity to Pay $2 Million to Settle FTC Deceptive Advertising Charges for Its "Brain Training" Program* (communiqué de presse). [URL] https://www.ftc.gov/news-events/news/press-releases/2016/01/lumosity-pay-2-million-settle-ftc-deceptive-advertising-charges-its-brain-training-program

**Références envisagées mais non retenues (non vérifiées dans la source primaire)**
- Takenaga et al. (2013), preuve de NP-complétude du Shikaku — mentionnée par des sources secondaires uniquement.
- Résultats de NP-complétude des nonogrammes — attestés par plusieurs travaux secondaires, source primaire non consultée.
