# 美术生成提示词合集

这些原稿使用内置 image_gen 工具生成或编辑，没有使用 CLI/API fallback。角色帧、嘴型、眨眼、像素化、微动、过渡和 GIF 导出由交付代码完成。最终搜索素材经内置 image_gen 局部修正尾巴透视：白色尾根自然接入后臀，弯曲尾身保留体积并向灰色尖端收细。build_search_pose.py 只进行透明归一化和动画地标记录，不应用代码绘制的多边形补白。旧脚本与备份保留为历史，不是最终素材来源。

最终搜索原稿为 assets/poses/search-generated-perspective.png，透明归一化输出为 assets/poses/search.png；尾巴从尖端到根部为深灰、浅灰、白色。下面逐字收录实际保存的完整提示词，最后一节对应最终透视修正。

## 原插画参考

源文件：assets/illustration/prompt.txt

```text
Use case: style-transfer / identity-preserve.
Asset type: transparent high-definition illustration sprite sheet for a 400-pixel desktop AI companion.
Input image 1: the exact character identity reference, originally pixel art. Preserve this character faithfully while redrawing it as a polished 2D chibi illustration.

Primary request: Produce ONE wide transparent PNG sprite sheet, aspect ratio exactly 2:1, ideally 2048x1024 or higher detail. The sheet has two equal square cells in a single horizontal row. LEFT cell: friendly neutral expression, both eyes fully open. RIGHT cell: the SAME character in the SAME frontal head-and-scarf pose, same scale and precise alignment, with the eye on the viewer's right closed in a cute curved wink and the other eye fully open. Both smiles should match. Do not tilt the head in the sheet; the software will animate the tilt. These are two expressions of one character, not separate character designs.

Identity invariants: Adorable chibi non-human mascot with a large round white face, fluffy white bangs and a central asymmetric white hair lock. Wear the distinctive dark desaturated slate-navy hood with TWO very tall pointed cat/fox-like ears. Match their silhouettes and star motifs: tall ear on viewer's right has a prominent pale cross-shaped star high up and another pale star below; ear on viewer's left has its smaller pale star decoration. The dark hood hugs both cheeks with broad side panels. Large glossy cyan-blue eyes with dark navy edges and bright orange four-point star-shaped highlights, as in the reference. Tiny dark charcoal nose, faint pink cheek blush marks, small friendly curved pink smile. A broad soft periwinkle/sky-blue scarf wraps the neck, with the small knotted or fluttering scarf end on the viewer's right and a darker navy tapered bust tip below. Keep the reference color identity, ear proportions, visible white hair, star shapes and scarf arrangement.

Style/medium: High-quality hand-drawn Japanese-inspired chibi character illustration, clean fine controlled linework, crisp silhouette, smooth tasteful cel shading and soft secondary highlights, gently shaded fabric folds, elegant hair strands, high-definition drawing that remains legible at 400 pixels. The character should feel like a refined illustrated version of the supplied pixel mascot, never a human person, 3D toy, plush, realistic animal or glossy plastic rendering.

Composition: Each square cell contains the complete same head-and-scarf bust with both ear tips fully inside the cell, approximately 8 percent transparent padding on every side. Identical vertical and horizontal placement within the two cells, same eye/nose/ear/scarf landmark coordinates, same proportions, matching line art, exact same colors and lighting. Do not draw arms, hands or a full body. The wink is the ONLY intentional difference.

Scene/backdrop: Genuinely transparent alpha background everywhere outside the character, including between the ears and below the scarf. No background color, no checkerboard pattern, no shadow on a surface, no glowing backdrop, no surrounding decorations.

Text: none. Avoid labels, lettering, numbers, logos, signatures, watermarks, sprite cell borders and separators. Do not add accessories or change the character costume.
```

## 呜咪六姿态

源文件：assets/poses/prompt.txt

```text
Use case: identity-preserve / stylized-concept.
Asset type: a production transparent sprite sheet of six reactive half-body poses for the same cute desktop AI companion.

Input image 1 is the AUTHORITATIVE character identity and costume reference: the complete character design sheet of Umi, a male white-and-gray anthropomorphic WOLF. Input image 2 is ONLY a rendering-style reference: the earlier cute polished illustrated avatar. Preserve the design from image 1 while using the crisp, softly shaded chibi illustration finish of image 2. Umi must read as the same wolf character in every pose.

Primary request: Generate ONE wide 3-by-2 sprite sheet, exactly three columns and two rows of equal square cells, canvas ratio 3:2, high detail, ideally 2400x1600. Six poses of ONE identical front-facing seated half-body character, not six different characters. Each cell includes the complete hood ears, face, scarf, shoulders, white furry upper torso and both gray furry paws. Keep head scale, costume, eye/nose centerline, shoulder line, lighting and torso framing identical in all six cells. Keep the head upright and frontal in every cell; only expressions and forepaw/arm positions change. Leave generous transparent padding and transparent gaps so no character or raised paw overlaps a neighboring cell.

Authoritative identity details from image 1: Umi is an adorable male anthropomorphic WOLF, with white fluffy face and white chest, a subtly canine muzzle rather than a flat cat muzzle, small dark gray nose, light gray markings at the side of his head and a small gray forehead marking visible near the bangs. White/gray fur. Blue eyes with friendly large chibi proportions; restrained orange star glints can remain from the style reference. Dark desaturated slate-blue hood with tall pointed asymmetric wolf-ear shapes, the viewer-left top bent slightly outward, small pale cross/star stitches along the ears and pale zigzag embroidery around the hood opening. Broad blue scarf, two pale white stripes and small star/snowflake embroidery, scarf tail on viewer's right. Dark blue-gray cape shoulders. Both forepaws have medium-gray fur, rounded wolf fingers/toes, tiny pale claws, soft PINK paw pads when the underside faces the viewer, and WHITE wrist/forearm fur cuffs. Paws must never become human hands, mitten gloves or white cat paws. Do not change the species to a cat, fox, rabbit or human.

Exact pose order, reading left to right then top to bottom:
1 TOP LEFT / neutral: calm friendly closed-mouth smile, eyes open, both gray paws resting low together in front of torso.
2 TOP CENTER / think: one gray paw supports the chin gently, elbow low; thoughtful eyes glance slightly upward, mouth closed. The other paw rests low. Keep nose and hood in the same position.
3 TOP RIGHT / work: both gray paws extended slightly forward below the scarf, as though gently operating a keyboard, attentive eyes open and mouth closed. NO keyboard, desk, device or prop.
4 BOTTOM LEFT / speak: one gray paw palm-up beside the lower chest in a friendly explaining gesture, pink pads subtly visible, other paw low; small gently OPEN speaking mouth, eyes open.
5 BOTTOM CENTER / happy: cheerful smile with the eye on viewer's right closed in a cute wink, one gray paw raised near shoulder level waving, pink pads visible, other paw low. Paw must stay below the top of the head and within its own cell.
6 BOTTOM RIGHT / rest: peacefully closed eyes and a small closed-mouth sleepy smile, both gray paws nestled together low near the chest, relaxed shoulders. Keep the head upright and aligned rather than tilted sideways.

Style and polish: refined high-definition 2D chibi character illustration, clean fine controlled linework, soft cel-shaded folds and fur detail, crisp readable silhouette, warm gentle expression, friendly UI mascot proportions. Match image 2's cute illustrated finish, but retain WOLF anatomy and the authoritative gray paws/pink pads/white cuffs from image 1. Not pixel art, not 3D, not photorealistic, not a human in a costume. All six views must have exact same head size and matching neutral lighting; avoid independent scale, crop or camera changes.

Background: genuine transparent alpha, including all gaps between cells. No scenery, colored panels, white backdrop, checkerboard pattern, floor shadows, glow effects or surrounding decorations.
Text: none whatsoever. No letters, numbers, labels, logos, watermarks, signatures, grid lines, cell borders or separators. Do not copy any writing, arrows or color swatches from the design sheet.
```

## 埋头搜索姿态

源文件：assets/poses/search-prompt.txt

```text
Use case: identity-preserve / precise-object-edit.
Asset type: ONE single transparent pose sprite for a cute desktop coding companion, square high-resolution 1024x1024 or larger.
Input image 1: the current Umi neutral UI illustration. Match its exact refined cute 2D chibi drawing style, character colors and costume. Input image 2: AUTHORITATIVE full character design and especially his gray-white fluffy WOLF tail and anatomy. Preserve the identity of Umi, a male white-and-gray anthropomorphic wolf, never a cat or a human.

Primary request: Show this SAME Umi comically searching for information by leaning forward and burying his head and front upper body in/behind a small pile of papers or thin unmarked folders near the bottom of the sprite. His face and mouth are completely hidden by the papers. Only a small recognizable tip/edge of his slate-blue star-stitched wolf-ear hood and a little blue scarf peek out near the papers. His compact white-gray furry hindquarters remain visible just above/behind the paper pile, and ONE LARGE fluffy gray-and-white WOLF TAIL rises prominently into the upper-middle of the frame. The tail is the main expressive silhouette, in a gentle upright curved S, with gray fur and a white stripe/tip pattern matching the tail in the full design sheet. The later software will animate the tail swaying left and right, so make the tail unobstructed against transparent background, clearly attached at a single visible base at the rump, with generous empty space on BOTH sides of the entire raised tail. Draw only ONE tail. No motion trails or alternate positions.

Composition: Single centered compact chibi character and small paper pile, a cute rump-up searching pose viewed from a rear three-quarter angle. The small paper pile is mainly along the lower third; the head is buried down in it rather than looking at the viewer. The raised fluffy tail occupies the upper middle; keep it centered enough for later left/right rotation around its base without clipping. The full pose should occupy approximately x=130..890 and y=130..940 of a 1024 square, leaving fully transparent padding on all edges. Keep the whole tail, hindquarters, tiny visible hood/scarf and paper pile inside the frame. Do not fill the frame with a large scene or room. This must read at a small UI size.

Identity details: white-gray furry anthropomorphic male WOLF, gray furry paws with pink pads when visible and white wrist fur, slate-gray blue hood with pale star/cross stitches and zigzag pale trim, blue scarf with two pale stripes and star embroidery. A little of those costume details is enough to identify him even though his head is hidden. The tail and furry rear must match the full character reference. Avoid naked human anatomy; this is a furry cartoon wolf mascot wearing his established costume/cape. Do not add a human mouth or human hands.

Style: clean fine linework, crisp soft cel shading, polished gentle chibi illustration matching input image 1, soft fur tufts, simple readable shapes. Cute and busy, curious and playful. No photorealism, no 3D render, no pixel art, no plush-toy look.

Background: genuine transparent alpha everywhere outside the sprite, including gaps around papers and the entire raised tail. No colored backdrop, checkerboard, floor, table, cast shadow, glow, room or surrounding props. Papers/folders are a small part of the pose, with clean blank surfaces: absolutely no writing, text, numbers, letters or symbols on papers.
Text: none. No labels, captions, logos, signatures or watermark. No contact sheet, grid, sprite strip or multiple poses. Produce exactly ONE pose.
```

## 搜索尾巴配色修正

源文件：assets/poses/search-recolor-prompt.txt

```text
Use case: precise-object-edit / identity-preserve.
Edit target: the attached transparent searching-pose sprite. Change ONLY the large raised wolf tail's fur pigmentation. Preserve every other part of the image exactly, including the character's pose, outline, shape of the tail, tail attachment location, size, framing, paper pile, hood, scarf, paws, linework, and transparent background.

The current tail has the WRONG white tip. Correct the tail to exactly THREE contiguous color regions in this order when following the tail from its TOP CURVED TIP down to its BOTTOM ATTACHMENT/ROOT:
1. TIP / top curved end: DEEP GRAY solid fur pigmentation, approximately #6f7378.
2. MIDDLE / central tail length: LIGHT GRAY solid fur pigmentation, approximately #b6b7b9.
3. ROOT / bottom attachment to the white furry rump: WHITE solid fur pigmentation.

Use natural slightly jagged canine fur-tuft boundaries between these three regions. Follow the tail's curved anatomy; the top curved end must read clearly deep gray, the central tail clearly light gray, and the bottom attachment clearly white. There must be exactly these three broad contiguous zones: DEEP GRAY TIP -> LIGHT GRAY MIDDLE -> WHITE ROOT. Do NOT make a white tip, do NOT make a gray or dark root, and do NOT alternate repeated gray-white stripes. A small amount of soft lighting/shading is fine, but shading must not create additional fur-color bands or reverse this large-area color order. Remove the existing white tip pigmentation completely.

Keep the existing refined 2D chibi illustration style, clean outline and fur silhouette. Do not redraw the character or change any props. Retain the exact ONE tail, existing paper pile and existing small hidden-head blue-hooded wolf pose. No text, no extra elements, no background. Preserve genuine alpha transparency everywhere outside the existing sprite. Keep the exact original canvas dimensions and artwork placement.
```

## 搜索尾根自然白毛修补（历史）

源文件：assets/poses/search-natural-root-prompt.txt

```text
Use case: precise-object-edit / identity-preserve.
Input image 1 is the EDIT TARGET: the existing transparent searching-pose Umi sprite. Input image 2 is only the complete character identity and fur reference. Preserve the composition and exact pose of image 1.

Make ONE small, natural illustration correction: at the bottom of the raised tail, on the LEFT SIDE of the WHITE ROOT just where the tail joins the white rump, there is an unwanted gray connector/wedge of fur. On the 640-square edit target this little area is roughly x=354..389, y=331..367. Change that little gray connecting wedge into naturally WHITE FUR, with fine fur strands, smoothly integrated soft white-fur shading, and a seamless transition into the existing white root and white rump. It should look as if the original illustrator drew the tail attachment in white from the start. Preserve its fine dark contour and fold lines. Do NOT put a flat white painted patch, hard polygon, chunky pixel boundary, sticker, blank solid triangle or coarse mask over it. Keep the existing fur texture and refined 2D chibi shading quality.

Important color invariants: the tail ALREADY has the correct THREE contiguous color zones from its curved tip down to the rump: DEEP GRAY TIP -> LIGHT GRAY MIDDLE -> WHITE ROOT. Keep that ordering exactly. Do not change the deep-gray tip or the light-gray central band. Do not make a white tip or a dark/gray root. Do not add extra alternating bands. The only fur pigmentation change is removing the little gray connector at the left edge of the white root. A subtle pale gray/lavender shadow within white fur is fine; it must not read as a large gray fur patch.

Absolute preservation requirements: keep the entire current tail silhouette and size, its curved position, the character body silhouette, all papers and folders, hood with star stitching, blue striped scarf, visible gray paw, all outside transparent edges, canvas crop and placement exactly unchanged. Head remains hidden in the paper pile. No new pose, no extra tail, no other character changes. Keep the same fine linework and soft cel-shaded illustration style as image 1. Input image 2 must not cause a new character pose or background.

Output one square transparent PNG, same framing as the edit target, preferably same 640x640 dimensions. Preserve genuine alpha transparency everywhere outside the sprite, including the space around the tail. No background, floor, shadows on a surface, text, labels, watermarks, contact sheet or multiple poses.
```

## 最终搜索尾巴透视修正

源文件：assets/poses/search-perspective-prompt.txt；编辑工具：内置 image_gen（透明背景）；原稿：search-generated-perspective.png。

```text
Use case: precise-object-edit / identity-preserve.
Asset type: one transparent 2D chibi sprite for a terminal companion animation.
Input image 1 is the EDIT TARGET, the existing 640-square Umi searching sprite with head hidden in a paper pile. Input image 2 is only the character anatomy and fur-pattern reference; do not copy its poses or background.

Make exactly one local correction: redraw ONLY the raised fluffy tail and its attachment to the rear rump so the anatomy, three-dimensional form and perspective agree with the existing bent-over body. The existing tail looks like a flat broad leaf pasted onto a pinched root. Replace that with one natural canine tail viewed in the same three-quarter perspective as the body: a visibly thicker WHITE proximal tail root grows seamlessly from the rear hip/rump, with its attachment partly occluded by the rump fur and a small natural contact shadow. From that substantial root, the tail bends upward and curls back, with coherent volume and foreshortening, gradually tapering toward its curved pointed tip. The tail must attach to the BACK of the hip, not the neck or middle of the spine. Keep the tail fluffy and expressive, not a smooth tube, not an extra limb. Preserve approximately the existing raised arc, occupied upper-right region and overall visual balance; small silhouette changes needed for correct perspective are permitted. The localized edit region is the tail above the rump, approximately x=270..525, y=80..400 on image 1. Do not repaint the rest of the character.

Preserve the exact existing three-zone fur pigmentation in contiguous anatomical order from the outer tip toward the body: DEEP GRAY TIP -> LIGHT GRAY MIDDLE -> WHITE ROOT. Keep the base predominantly white with natural soft shading and fine white fur strands; do not turn it gray, create a white tip, add stripes or introduce a flat painted patch. Match the refined linework, chibi proportions, soft cel shading and existing color palette of image 1.

Lock all non-tail content: the buried head and star-stitched hood, white torso, visible gray paw, blue scarf and its stripes, every paper/folder, their overlapping order, ground-plane perspective, body placement, crop and canvas framing remain unchanged. The head stays hidden in the papers. Keep the same number of limbs and exactly one tail. No new objects, expression, camera angle, cast shadow, lettering or watermark.

Output one square PNG with genuine transparent alpha outside the sprite, including the negative space around the tail. Preserve the original transparent background, do not add a checkerboard or solid background. Prefer the same 640x640 framing. This is a tail-perspective repair of image 1, not a new illustration.
```
