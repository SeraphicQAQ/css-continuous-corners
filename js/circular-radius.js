/**
 * css-continuous-corners: circularRadius()
 * https://github.com/SeraphicQAQ/css-continuous-corners  (MIT License)
 *
 * `clip-path: inset(... round r)` always draws a circular corner; corner-shape does not apply
 * to it. Shared-element transitions that clip a moving copy that way would jump at both ends
 * when the real element has a superellipse corner with a larger radius. A circle that reaches
 * as deep into the corner along the 45° diagonal reads as the same corner, so use its radius.
 *
 *   frame.style.clipPath = `inset(0 round ${circularRadius(card)}px)`;
 */

const KEYWORDS = {
	round: 1,
	squircle: 2,
	square: Infinity,
	bevel: 0,
	scoop: -1,
	notch: -Infinity,
};

/**
 * The k of `superellipse(k)` for a computed corner shape; 1 (round) when unknown.
 * @param {string} value
 * @returns {number}
 */
export function shapeParameter(value) {
	const text = value.trim();
	if (text in KEYWORDS) {
		return KEYWORDS[text];
	}
	const match = /^superellipse\(\s*(-?infinity|[-+\d.e]+)\s*\)$/i.exec(text);
	if (!match) {
		return 1;
	}
	const k = /infinity$/i.test(match[1])
		? (match[1].startsWith("-") ? -1 : 1) * Infinity
		: Number(match[1]);
	return Number.isNaN(k) ? 1 : k;
}

/**
 * How far a superellipse(k) corner reaches along the diagonal, as a share of its radius.
 * @param {number} k
 */
export const depth = (k) => 1 - 2 ** (-1 / 2 ** k);

/**
 * The radius of the circular corner that looks like a superellipse(k) corner of `radius`.
 * @param {number} radius
 * @param {number} k
 */
export function equivalentCircle(radius, k) {
	// Concave and bevelled corners have no matching circle; keep their radius.
	return k > 1 ? (radius * depth(k)) / depth(1) : radius;
}

/**
 * The radius of the circular corner that looks like `element`'s top-left corner.
 * @param {Element} element
 * @returns {number}
 */
export function circularRadius(element) {
	const style = getComputedStyle(element);
	const radius = parseFloat(style.borderTopLeftRadius) || 0;
	const k = shapeParameter(style.getPropertyValue("corner-top-left-shape") || "round");
	return equivalentCircle(radius, k);
}
