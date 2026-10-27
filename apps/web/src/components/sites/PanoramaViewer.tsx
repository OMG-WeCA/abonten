'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { assetDisplay, type SiteAsset } from '../../lib/sites-api';

/** A perspective view of a full equirectangular sphere. No remote viewer service,
 * scripts, or asset URL is exposed; protected media is fetched with the session. */
export function PanoramaViewer({ src, locale }: { src: string; locale?: string }) {
  const fr = locale === 'fr';
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef({ yaw: 0, pitch: 0, fov: 75 });
  const draw = useRef<() => void>(() => undefined);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const move = (yaw = 0, pitch = 0, zoom = 0) => {
    const c = camera.current;
    c.yaw = (c.yaw + yaw) % (2 * Math.PI);
    c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + pitch));
    c.fov = Math.max(35, Math.min(100, c.fov + zoom));
    draw.current();
  };
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    setError(false);
    setReady(false);
    const gl = el.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) {
      setError(true);
      return;
    }
    let disposed = false;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const image = new Image();
    const fail = () => {
      if (!disposed) setError(true);
    };
    const lost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    el.addEventListener('webglcontextlost', lost);
    const observer = new ResizeObserver(() => draw.current());
    try {
      if (!program || !buffer || !texture) throw Error('Viewer resources unavailable');
      const compile = (type: number, code: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw Error('Shader unavailable');
        shaders.push(shader);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('Shader unavailable');
        gl.attachShader(program, shader);
      };
      compile(
        gl.VERTEX_SHADER,
        'attribute vec2 point; varying vec2 position; void main(){position=point;gl_Position=vec4(point,0.0,1.0);}',
      );
      compile(
        gl.FRAGMENT_SHADER,
        `precision highp float;
        varying vec2 position; uniform sampler2D photo; uniform vec4 view;
        void main(){
          vec3 ray=normalize(vec3(position.x*view.w*tan(radians(view.z)*0.5),position.y*tan(radians(view.z)*0.5),-1.0));
          float cp=cos(view.y),sp=sin(view.y),cy=cos(view.x),sy=sin(view.x);
          ray=vec3(ray.x,cp*ray.y-sp*ray.z,sp*ray.y+cp*ray.z);
          ray=vec3(cy*ray.x+sy*ray.z,ray.y,-sy*ray.x+cy*ray.z);
          vec2 uv=vec2(atan(ray.x,-ray.z)/6.28318530718+0.5,asin(clamp(ray.y,-1.0,1.0))/3.14159265359+0.5);
          gl_FragColor=texture2D(photo,uv);
        }`,
      );
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Viewer unavailable');
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const point = gl.getAttribLocation(program, 'point');
      gl.enableVertexAttribArray(point);
      gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
      const view = gl.getUniformLocation(program, 'view');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, 'photo'), 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      image.onload = () => {
        if (disposed) return;
        try {
          const max = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
          let source: TexImageSource = image;
          if (image.width > max || image.height > max) {
            const resized = document.createElement('canvas');
            const scale = max / Math.max(image.width, image.height);
            resized.width = Math.round(image.width * scale);
            resized.height = Math.round(image.height * scale);
            const context = resized.getContext('2d');
            if (!context) throw Error('Resize unavailable');
            context.drawImage(image, 0, 0, resized.width, resized.height);
            source = resized;
          }
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
          draw.current = () => {
            if (disposed || gl.isContextLost()) return;
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            el.width = Math.max(1, Math.round(el.clientWidth * ratio));
            el.height = Math.max(1, Math.round(el.clientHeight * ratio));
            gl.viewport(0, 0, el.width, el.height);
            const c = camera.current;
            gl.uniform4f(view, c.yaw, c.pitch, c.fov, el.width / el.height);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          };
          observer.observe(el);
          draw.current();
          setReady(true);
        } catch {
          fail();
        }
      };
      image.onerror = fail;
      image.src = src;
    } catch {
      fail();
    }
    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
      image.src = '';
      observer.disconnect();
      draw.current = () => undefined;
      el.removeEventListener('webglcontextlost', lost);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      for (const shader of shaders) gl.deleteShader(shader);
    };
  }, [src, attempt]);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label={
          fr
            ? 'Panorama 360°. Faites glisser ou utilisez les flèches pour regarder autour.'
            : '360° panorama. Drag or use arrow keys to look around.'
        }
        className={`h-72 w-full touch-none cursor-grab bg-background focus-visible:outline-2 focus-visible:outline-primary sm:h-96 ${error ? 'hidden' : ''}`}
        onPointerDown={(e) => {
          elFocus(e.currentTarget);
          e.currentTarget.setPointerCapture(e.pointerId);
          pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const p = pointer.current;
          if (!p || p.id !== e.pointerId) return;
          move((e.clientX - p.x) * 0.005, (e.clientY - p.y) * 0.005);
          pointer.current = { id: p.id, x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          pointer.current = null;
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
        }}
        onKeyDown={(e) => {
          const actions: Record<string, () => void> = {
            ArrowLeft: () => move(0.12),
            ArrowRight: () => move(-0.12),
            ArrowUp: () => move(0, 0.12),
            ArrowDown: () => move(0, -0.12),
            '+': () => move(0, 0, -5),
            '-': () => move(0, 0, 5),
          };
          if (actions[e.key]) {
            e.preventDefault();
            actions[e.key]();
          }
        }}
      />
      {error ? (
        <div className="space-y-3 p-3">
          <p role="alert" className="text-sm">
            {fr
              ? 'La vue interactive est indisponible. Voici l’image complète.'
              : 'Interactive viewing is unavailable. The full image is shown below.'}
          </p>
          <img
            src={src}
            alt={fr ? 'Image panoramique complète' : 'Full panorama image'}
            className="w-full"
          />
          <button
            type="button"
            onClick={() => setAttempt((v) => v + 1)}
            className="min-h-11 px-3 text-sm font-semibold"
          >
            {fr ? 'Réessayer la vue 360°' : 'Retry 360° view'}
          </button>
        </div>
      ) : (
        <>
          {!ready && (
            <p role="status" className="p-3 text-sm">
              {fr ? 'Chargement du panorama…' : 'Loading panorama…'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="mr-auto text-muted">
              {fr ? 'Faites glisser pour regarder autour.' : 'Drag to look around.'}
            </span>
            <button
              type="button"
              disabled={!ready}
              onClick={() => move(0, 0, -10)}
              aria-label={fr ? 'Zoom avant' : 'Zoom in'}
              className="min-h-11 min-w-11 rounded border border-border px-3"
            >
              +
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => move(0, 0, 10)}
              aria-label={fr ? 'Zoom arrière' : 'Zoom out'}
              className="min-h-11 min-w-11 rounded border border-border px-3"
            >
              −
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                camera.current = { yaw: 0, pitch: 0, fov: 75 };
                draw.current();
              }}
              className="min-h-11 rounded border border-border px-3"
            >
              {fr ? 'Réinitialiser' : 'Reset view'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
function elFocus(el: HTMLCanvasElement) {
  el.focus({ preventScroll: true });
}

export function AuthPanorama({ asset, locale }: { asset: SiteAsset; locale?: string }) {
  const [requested, setRequested] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let url: string | null = null;
    setError(false);
    setSrc(null);
    const display = assetDisplay(asset);
    if (display.plain) {
      setSrc(display.plain);
      return;
    }
    void apiFetch(
      `/api/inventory/sites/${encodeURIComponent(asset.siteId)}/assets/${encodeURIComponent(asset.id)}/file`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw Error('Unavailable');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset, requested, attempt]);
  return src ? (
    <PanoramaViewer src={src} locale={locale} />
  ) : (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      {error && (
        <p role="alert" className="mb-2 text-sm text-error">
          {locale === 'fr'
            ? 'Le panorama n’a pas pu être chargé.'
            : 'The panorama could not be loaded.'}
        </p>
      )}
      {requested && !error ? (
        <p role="status">{locale === 'fr' ? 'Chargement du panorama…' : 'Loading panorama…'}</p>
      ) : (
        <button
          type="button"
          className="min-h-11 rounded-lg border border-border px-4 font-semibold"
          onClick={() => {
            setRequested(true);
            setAttempt((v) => v + 1);
          }}
        >
          {locale === 'fr'
            ? error
              ? 'Réessayer le panorama'
              : 'Ouvrir le panorama 360°'
            : error
              ? 'Retry panorama'
              : 'Open 360° panorama'}
        </button>
      )}
    </div>
  );
}
