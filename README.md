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

Esta es solo la **Fase 1**.  
El generador crea el `main.lua` + carpetas + iconos/sonidos, pero **todavía necesitas el modelo 3D** (el archivo `.bin` / geo) para que el personaje aparezca en el juego.

## Próximos pasos posibles

- Visor 3D con Three.js
- Ayuda para posicionar el modelo sobre el esqueleto de Mario
- Mejor soporte de voces y paletas

Hecho para la comunidad de SM64 Coop DX.
