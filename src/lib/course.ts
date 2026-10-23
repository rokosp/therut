/** Works out par, rating and per-hole data for the holes actually played in a match. */

export interface CourseInfo {
  holes: 9 | 18;
  par: number;
}

export interface TeeInfo {
  course_rating: number | null;
  slope: number | null;
  hole_pars: number[] | null;
  stroke_index: number[] | null;
}

export interface PlayedHoles {
  holes: 9 | 18;
  par: number;
  courseRating: number | null;
  slope: number | null;
  holePars: number[] | null;
  strokeIndex: number[] | null;
}

/** Re-rank stroke indexes within a slice, so the hardest hole of the nine gets 1. */
function rerank(si: number[]): number[] {
  const order = [...si.keys()].sort((a, b) => si[a] - si[b]);
  const out = new Array(si.length);
  order.forEach((holeIdx, rank) => (out[holeIdx] = rank + 1));
  return out;
}

export function playedHoles(
  match: { holes: 9 | 18; nine?: 'front' | 'back' | null },
  course: CourseInfo | null,
  tee: TeeInfo | null,
): PlayedHoles {
  const pars = tee?.hole_pars && tee.hole_pars.length === (course?.holes ?? 0) ? tee.hole_pars : null;
  const si = tee?.stroke_index && tee.stroke_index.length === (course?.holes ?? 0) ? tee.stroke_index : null;
  const rating = tee?.course_rating != null ? Number(tee.course_rating) : null;
  const slope = tee?.slope ?? null;

  if (!course) {
    return { holes: match.holes, par: match.holes === 18 ? 72 : 36, courseRating: null, slope: null, holePars: null, strokeIndex: null };
  }

  if (match.holes === course.holes) {
    return { holes: match.holes, par: course.par, courseRating: rating, slope, holePars: pars, strokeIndex: si };
  }

  if (match.holes === 9 && course.holes === 18) {
    const start = match.nine === 'back' ? 9 : 0;
    const slicePars = pars ? pars.slice(start, start + 9) : null;
    return {
      holes: 9,
      par: slicePars ? slicePars.reduce((a, b) => a + b, 0) : Math.round(course.par / 2),
      courseRating: rating != null ? Math.round((rating / 2) * 10) / 10 : null,
      slope,
      holePars: slicePars,
      strokeIndex: si ? rerank(si.slice(start, start + 9)) : null,
    };
  }

  // 18 holes on a 9-hole course: the nine is played twice.
  return {
    holes: 18,
    par: course.par * 2,
    courseRating: rating != null ? rating * 2 : null,
    slope,
    holePars: pars ? [...pars, ...pars] : null,
    strokeIndex: si ? [...si.map((x) => x * 2 - 1), ...si.map((x) => x * 2)] : null,
  };
}
