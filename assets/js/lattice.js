// Replays checked-in telemetry from a real Gazebo mission. Never contacts a robot API.
export async function initLattice(root) {
  const response = await fetch(new URL('../data/lattice-round.json', import.meta.url));
  if (!response.ok) throw new Error('Recorded Lattice run unavailable');
  const run = await response.json();
  const frames = run.poses;
  if (!Array.isArray(frames) || frames.length < 2 || frames.some(f =>
    !Number.isFinite(f.t) || !Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.yaw))) {
    throw new Error('Recorded Lattice telemetry is invalid');
  }
  const slider = root.querySelector('[data-lattice-time]');
  const play = root.querySelector('[data-lattice-play]');
  const clock = root.querySelector('#lattice-clock');
  const state = root.querySelector('[data-lattice-state]');
  const rover = root.querySelector('[data-lattice-rover]');
  const path = root.querySelector('[data-lattice-path]');
  let index = 0, timer = null;
  const map = f => [(f.x + 5) * 58 + 30, (4 - f.y) * 45 + 30];
  path.setAttribute('points', frames.map(f => map(f).join(',')).join(' '));
  slider.max = String(frames.length - 1);
  function render() {
    const f = frames[index], [x,y] = map(f);
    rover.setAttribute('transform', `translate(${x} ${y}) rotate(${-f.yaw * 180 / Math.PI})`);
    rover.setAttribute('visibility', 'visible');
    slider.value = String(index);
    clock.textContent = `${f.t.toFixed(1)} s`;
    const event = run.events.findLast(e => e.t <= f.t);
    state.textContent = `${event?.title ?? f.status} · map position ${f.x.toFixed(2)}, ${f.y.toFixed(2)} m. Recorded ${run.recorded_at.slice(0,10)}.`;
  }
  function stop() {
    clearTimeout(timer); timer = null;
    play.textContent = 'Play recorded run'; play.setAttribute('aria-pressed', 'false');
  }
  function step() {
    if (index >= frames.length - 1) { stop(); return; }
    const delay = Math.max(50, Math.min(1500, (frames[index+1].t - frames[index].t) * 1000));
    timer = setTimeout(() => { index++; render(); step(); }, delay);
  }
  slider.addEventListener('input', () => { stop(); index = Number(slider.value); render(); });
  play.addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    if (index === frames.length-1) index = 0;
    play.textContent = 'Pause replay'; play.setAttribute('aria-pressed', 'true');
    render(); step();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  root.querySelector('[data-lattice-controls]').hidden = false;
  render();
}
