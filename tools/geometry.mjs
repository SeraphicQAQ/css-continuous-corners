#!/usr/bin/env node
/**
 * Corner geometry behind css-continuous-corners: for each superellipse(k) it prints
 *
 *   scale      radius multiplier that keeps the corner's depth along the 45° diagonal
 *   max Δ      largest distance between the new outline and the old circular arc (px)
 *   peak κr    peak curvature, normalised so the circle is 1
 *   factor     concentric factor f: inner radius = R − f · gap keeps the corner gap even
 *   gap error  worst corner-gap error with the plain R − gap, and with R − f · gap (px)
 *
 * Usage:
 *   node tools/geometry.mjs [--r=23.8] [--gap=10.2] [--k=1.3,1.6,2] [--figma]
 *
 * --figma also finds the superellipse closest to Figma's corner smoothing at 60 % ("iOS")
 * and 100 % (slower, a few seconds).
 *
 * Coordinates: the corner sits at the origin, the edges run along +x and +y, and each curve
 * is sampled from the left edge (0, R) to the top edge (R, 0).
 */

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value = "true"] = arg.replace(/^--/, "").split("=");
		return [key, value];
	}),
);
const r = Number(args.r ?? 23.8);
const gap = Number(args.gap ?? 10.2);
const ks = String(args.k ?? "1.3,1.6,2").split(",").map(Number);

/** A superellipse(k) corner of radius R: |X|^n + |Y|^n = 1 around (R, R), n = 2^k. */
function superellipse(R, k, steps = 400) {
	const n = 2 ** k;
	const points = [];
	for (let i = 0; i <= steps; i++) {
		const t = (i / steps) * (Math.PI / 2);
		points.push([R - R * Math.cos(t) ** (2 / n), R - R * Math.sin(t) ** (2 / n)]);
	}
	return points;
}

/** Extend a corner with straight edges out to `span`, so curves of different radii compare. */
const withEdges = (points, span) => [[0, span], ...points, [span, 0]];

function distanceToPolyline([px, py], line) {
	let best = Infinity;
	for (let i = 0; i < line.length - 1; i++) {
		const [ax, ay] = line[i];
		const [bx, by] = line[i + 1];
		const dx = bx - ax;
		const dy = by - ay;
		const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
		best = Math.min(best, Math.hypot(ax + t * dx - px, ay + t * dy - py));
	}
	return best;
}

/** Symmetric Hausdorff distance between two polylines. */
function hausdorff(a, b) {
	let worst = 0;
	for (const point of a) worst = Math.max(worst, distanceToPolyline(point, b));
	for (const point of b) worst = Math.max(worst, distanceToPolyline(point, a));
	return worst;
}

/** How far a superellipse(k) corner reaches along the diagonal, as a share of its radius. */
const depth = (k) => 1 - 2 ** (-1 / 2 ** k);
const scaleFor = (k) => depth(1) / depth(k);

/** Peak of curvature × r along a corner, by discrete differentiation. */
function peakCurvature(R, k) {
	const points = superellipse(R, k, 20000);
	let peak = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const [x0, y0] = points[i - 1];
		const [x1, y1] = points[i];
		const [x2, y2] = points[i + 1];
		const a = Math.hypot(x1 - x0, y1 - y0);
		const b = Math.hypot(x2 - x1, y2 - y1);
		const c = Math.hypot(x2 - x0, y2 - y0);
		const cross = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
		if (a * b * c > 1e-14) peak = Math.max(peak, (2 * Math.abs(cross)) / (a * b * c));
	}
	return peak * r;
}

/** Worst corner-gap error for an inner superellipse of radius Ri inset by `gap`. */
function gapError(outer, Ri, k) {
	let worst = 0;
	for (const [x, y] of superellipse(Ri, k, 150)) {
		worst = Math.max(worst, Math.abs(distanceToPolyline([x + gap, y + gap], outer) - gap));
	}
	return worst;
}

function concentric(R, k) {
	const outer = withEdges(superellipse(R, k, 2000), R * 3);
	const naive = gapError(outer, R - gap, k);
	let best = { factor: 1, error: naive };
	for (let f = 1; f <= 2.4; f += 0.01) {
		const Ri = R - gap * f;
		if (Ri <= 0) break;
		const error = gapError(outer, Ri, k);
		if (error < best.error) best = { factor: f, error };
	}
	return { naive, ...best };
}

/** figma-squircle corner (radius r, smoothing s), as in github.com/phamfoo/figma-squircle. */
function figma(radius, smoothing, steps = 200) {
	const rad = (deg) => (deg * Math.PI) / 180;
	const p = (1 + smoothing) * radius;
	const arcMeasure = 90 * (1 - smoothing);
	const arcSection = Math.sin(rad(arcMeasure / 2)) * radius * Math.SQRT2;
	const alpha = (90 - arcMeasure) / 2;
	const p3p4 = radius * Math.tan(rad(alpha / 2));
	const beta = 45 * smoothing;
	const c = p3p4 * Math.cos(rad(beta));
	const d = c * Math.tan(rad(beta));
	const b = (p - arcSection - c - d) / 3;
	const a = 2 * b;
	const cubic = (p0, p1, p2, p3) =>
		Array.from({ length: steps + 1 }, (_, i) => {
			const t = i / steps;
			const u = 1 - t;
			return [0, 1].map((j) => u ** 3 * p0[j] + 3 * u * u * t * p1[j] + 3 * u * t * t * p2[j] + t ** 3 * p3[j]);
		});
	const first = cubic([p, 0], [p - a, 0], [p - a - b, 0], [p - a - b - c, d]);
	const [sx, sy] = first.at(-1);
	const from = Math.atan2(sy - radius, sx - radius);
	const to = Math.atan2(sx - radius, sy - radius);
	const arc = Array.from({ length: steps + 1 }, (_, i) => {
		const t = from + ((to - from) * i) / steps;
		return [radius + radius * Math.cos(t), radius + radius * Math.sin(t)];
	});
	const second = first.map(([x, y]) => [y, x]).reverse();
	return [...first, ...arc, ...second].reverse();
}

function closestScaleAtK(smoothing, k) {
	const span = r * 2.6;
	const target = withEdges(figma(r, smoothing), span);
	let best = { scale: 1, error: Infinity };
	for (let scale = 1; scale <= 2.3; scale += 0.005) {
		const error = hausdorff(withEdges(superellipse(r * scale, k, 160), span), target);
		if (error < best.error) best = { scale, error };
	}
	return best;
}

function closestSuperellipse(smoothing) {
	const span = r * 2.6;
	const target = withEdges(figma(r, smoothing), span);
	const score = (k, scale) => hausdorff(withEdges(superellipse(r * scale, k, 160), span), target);
	let best = { k: 1, scale: 1, error: Infinity };
	for (let k = 1; k <= 3.001; k += 0.1) {
		for (let scale = 1; scale <= 2.3; scale += 0.05) {
			const error = score(k, scale);
			if (error < best.error) best = { k, scale, error };
		}
	}
	const coarse = best;
	for (let k = coarse.k - 0.1; k <= coarse.k + 0.1; k += 0.02) {
		for (let scale = coarse.scale - 0.05; scale <= coarse.scale + 0.05; scale += 0.005) {
			const error = score(k, scale);
			if (error < best.error) best = { k, scale, error };
		}
	}
	return best;
}

const circle = withEdges(superellipse(r, 1, 400), r * 3);
const rows = ks.map((k) => {
	const scale = scaleFor(k);
	const R = r * scale;
	const fit = concentric(R, k);
	return {
		k,
		scale: scale.toFixed(3),
		"max Δ (px)": hausdorff(withEdges(superellipse(R, k, 400), r * 3), circle).toFixed(2),
		"peak κr": peakCurvature(R, k).toFixed(2),
		factor: fit.factor.toFixed(2),
		"gap error R−g (px)": fit.naive.toFixed(2),
		"gap error R−f·g (px)": fit.error.toFixed(2),
	};
});

console.log(`Circle radius r = ${r} px, concentric gap = ${gap} px\n`);
console.table(rows);
console.log(`Unscaled superellipse(2) at r: peak κr = ${peakCurvature(r, 2).toFixed(2)} (sharper than the circle)`);

if (args.figma) {
	console.log("\nClosest superellipse to figma-squircle corner smoothing:");
	for (const smoothing of [0.6, 1]) {
		const best = closestSuperellipse(smoothing);
		const fixed = ks.map((k) => {
			const at = closestScaleAtK(smoothing, k);
			return `superellipse(${k}) × ${at.scale.toFixed(2)} within ${at.error.toFixed(2)} px`;
		});
		console.log(
			`  ${Math.round(smoothing * 100)} %: best superellipse(${best.k.toFixed(2)}), radius × ${best.scale.toFixed(2)}, within ${best.error.toFixed(2)} px; at your k: ${fixed.join("; ")}`,
		);
	}
}
