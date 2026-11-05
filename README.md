# ENGLISH VERSION

# SM64 Coop DX - Character Mod Generator (Phase 3)

A simple web-based tool for generating the basic structure of a **Super Mario 64 Coop DX Character Select** character mod.

## How to Use

1. Open `index.html` in your browser (or host it using Netlify, GitHub Pages, or Vercel).
2. Enter your character's information.
3. Upload your character icons (optional).
4. Click **Generate Mod**.
5. A `.zip` file containing the generated mod folder will be downloaded.

## New Features (Real Rigging)

- **No CDN required:** All libraries are stored locally in the `lib/` folder (Three.js r128, loaders, JSZip, and FileSaver). The generator can work without an internet connection.
- **`rig.js`:** Bone-segment-based rigging. Each vertex is assigned to the nearest bone segment instead of the nearest bone position.
  - Use **Color by Bone** to check which bone controls each part of the model.
  - Adjust the assignment using the **Bone** control, then click *Rig* again.
- **Animated Model Export:** Each mesh part is exported in its bone's local space. The generated `geo.inc.c` uses Mario's animation hierarchy:
  - `GEO_ANIMATED_PART` ×20 (15 body parts, 1 empty root, and 4 pivots, following Mario's original geo structure).
  - `GEO_SCALE 16384`.
  - Export options include model type (Animated / Static), character height, and vertical adjustment.
- **Static Export:** Available as a fallback. The entire model is exported as a single piece without animation.
- **Bug fixes:**
  - Fixed auto-rigging incorrectly modifying mesh transformations.
  - Fixed mesh detection during export after rigging.
  - Fixed incorrect use of `boneTransform`.
  - Fixed Z-up rotation being applied to every export format.
  - Fixed inverted left/right bone assignments.

**Model orientation convention:** The character must face +Z (toward the camera). The character's left side should appear on the right side of the screen.

Bone axes (+X along the limb, +Y forward, +Z to the character's left) are based on Mario's bone structure and have **not yet been verified in-game**. If the character appears rotated, facing backward, or floating, try using *Static* export or adjusting the *Vertical Adjustment* option.

## Auto-Rig Adjustment

The **Auto-Adjust Rig + Rig** button automatically estimates joint positions (shoulders, hips, knees, and neck) based on the model's geometry in a T-pose, facing +Z.

After using this feature, **Rig to Mario** will no longer reset the rig configuration.

This is a heuristic system, so results may need manual adjustments. Use **Color by Bone**, the gizmo, and the **Arm Reach** slider to fine-tune the rig.

## Automatic Part Assignment by Name

If the model is separated into named parts (for example, `toro_head`, `toro_larm`, `Leg_L`, or `eye_r`), the exporter assigns each entire mesh part to its corresponding bone without splitting triangles.

If a part's name indicates "left" but the mesh is actually on the opposite side, the generator automatically flips the side assignment.

Parts without recognizable names are assigned using bone distance instead.

Check the browser console (`[parts]`, `[export]`) to see the generator's decisions.

**Automatic Texture Detection:** Only color maps (`map`) and solid material colors are assigned automatically. Normal, roughness, and other texture maps are detected and listed, but are not automatically assigned. A detected texture takes priority over a solid material color.

## Current Development Status

The generator is currently in **Phase 3**.

- The generator can create the `main.lua` file, folder structure, and character icons.
- Model exporting with rigging based on individual mesh parts has been implemented.
- DynOS can detect the exported model parts and convert them into `.bin` files when the game launches, allowing the character to appear in-game.
- Rigging improvements and website bug fixes are still in development.

**Please note:** This project is still a work in progress. Some features may not work perfectly, and exported models may require manual adjustments.

## Credits and Development

This project was developed with assistance from **Grok** and **Claude**, which helped with programming, debugging, and development ideas.

The generator is still under development and may contain bugs, unfinished features, or unexpected behavior.

## Want to Contribute?

Contributions are welcome!

If you are interested in helping improve the generator, especially with programming, rigging, exporting, or bug fixing, feel free to:

- Explore the source code.
- Modify or improve existing code.
- Fix bugs and suggest improvements.
- Share your changes and ideas.

You are welcome to experiment with the code and help make this project better. Every contribution is appreciated!

## Possible Future Improvements

- Improved texture support.
- More accurate and reliable rigging.
- Better mesh-part assignment and rigging controls.
- General bug fixes and improvements.

  # Version En Español :v
  
# SM64 Coop DX - Character Mod Generator (Fase 1)

Generador web simple para crear la estructura básica de un mod de personaje para **Character Select**.

## Cómo usarlo

1. Abre `index.html` en tu navegador (o súbelo a Netlify / GitHub Pages / Vercel).
2. Rellena los datos del personaje.
3. Sube iconos y sonidos (opcionales).
4. Pulsa **Generar Mod**.
5. Se descargará un `.zip` con la carpeta del mod lista.

## Música y sonidos

- Coloca el archivo de **Another Him** como `another-him.ogg` o `another-him.mp3` en la misma carpeta.
- Los sonidos de botones van en la carpeta `sfx/` (`click.wav`, `hover.wav`, `success.wav`).

Puedes descargar sonidos libres de derechos o usar los del propio juego.

## Novedades (rigging real)

- **Sin CDN:** todas las librerías están en `lib/` (Three.js r128, loaders, JSZip, FileSaver). Funciona sin internet.
- **`rig.js`:** rigging por segmentos de hueso (cada vértice va al hueso/segmento más cercano, no al punto más cercano).
  Botón **Colorear por hueso** para revisar qué pieza se lleva cada parte; ajusta con **Hueso** y vuelve a pulsar *Riggear*.
- **Export animado:** cada pieza se guarda en el espacio local de su hueso y `geo.inc.c` usa la jerarquía de Mario
  (`GEO_ANIMATED_PART` ×20 (15 piezas + raíz vacía + 4 pivotes, como el geo real de Mario), `GEO_SCALE 16384`). Opciones en la pestaña *Export*: tipo (Animado / Estático), altura y ajuste vertical.
- **Estático** queda como fallback (todo el modelo en una sola pieza, sin animación).
- Corregido: el auto-rig doblaba la transformación de la malla; el export no encontraba la malla tras riggear;
  `boneTransform` se usaba mal; la rotación Z-up se aplicaba a todos los formatos; el rig tenía izquierda/derecha invertidas.

**Convención:** el modelo debe mirar a +Z (hacia la cámara); su izquierda queda a la derecha de la pantalla.
Los ejes de cada hueso (+X a lo largo del miembro, +Y frente, +Z izquierda) están deducidos de la tabla de Mario
y **no se han verificado dentro del juego**. Si sale torcido, de espaldas o flotando, prueba *Estático* o ajusta *Ajuste vertical*.

## Auto-ajustar rig

Botón **Auto-ajustar rig + riggear**: calcula las articulaciones (hombros, caderas, rodillas, cuello) a partir de la geometría del modelo en T-pose, de frente a +Z. Después «Riggear al Mario» ya no reinicia el rig. Es una heurística: revisa con «Colorear por hueso» y afina con el gizmo y el slider «Alcance de brazos».

## Asignación por nombre de pieza

Si el modelo viene partido en piezas con nombre (`toro_head`, `toro_larm`, `Leg_L`, `eye_r`…), el export manda cada pieza completa a su hueso (no corta triángulos). Si el nombre dice «izquierda» pero la pieza está del lado contrario, se invierte el lado automáticamente. Las piezas sin nombre reconocible usan la distancia al hueso. Ver la consola (`[parts]`, `[export]`) para saber qué decidió.

**Texturas auto-detectadas:** solo los mapas de color (`map`) y los colores lisos se asignan solos; normal/roughness/etc. se listan pero no se asignan. Una textura real reemplaza a un color liso.

## Importante

Esta es solo la **Fase 3**.  
-El generador crea el `main.lua` + carpetas + iconos/sonidos,
-La exportacion del modelo Sige en Desarrollo Se logro exportar un Modelo Con rigeo a base de sus partes El Dynos Detecta las partes y las convierte en Bin (el archivo `.bin` / geo) para que el personaje aparezca en el juego.
-Falta Mejorar el Rigeo y Bugs en la pagina

## Próximos pasos posibles

- Texturas
- Rigeo Mejorado
- Partes En el Rigeo

Hecho para la comunidad de SM64 Coop DX.
## Advertencia

-Todo el Codigo Esta Hecho Con Grox Y Ayuda de Claude
-Pueden haber Demasiados errores en la Pagina/Programa asi que cualquier ayuda suya es mucho mejor :D

