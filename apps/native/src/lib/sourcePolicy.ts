// Hybrid auto-approve rule: a source counts as "auto-approving now" if the
// operator has explicitly flagged it, OR if it's an official_primary source
// with a trust score of 9.0 or higher (the implicit tier). Keeping this in
// one place so Source cards, Ops dashboards, and any future policy surface
// all ask the same question.

export const sourceAutoApprovesNow = (s: {
  auto_approve: boolean;
  source_class: string;
  trust_score: number | string;
}) => {
  if (s.auto_approve === true) return true;
  const t = typeof s.trust_score === 'string' ? parseFloat(s.trust_score) : s.trust_score;
  return s.source_class === 'official_primary' && t >= 9.0;
};
