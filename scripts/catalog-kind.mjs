// Conservative presentation labels. A single MIDI is not evidence of a complete work.
// Unidentified members of an archive remain "Edition selection" rather than guessed movements.
export function catalogKind(piece) {
  if (!piece.assets.midi) return 'Score only';
  if (piece.tags.includes('four seasons')) return 'Movement';
  const member = piece.archiveMembers?.midi?.split('/').pop()?.replace(/\.midi?$/i, '') ?? '';
  if (/(?:^|[-_ ])(?:part[-_ ]?(?:v[12]|va|vc|c|b)|violin[12]?|viola|cello|flute[12]?|oboe[12]?|clarinet[12]?|bassoon[12]?|trumpet[12]?|trombone[12]?|timpani)(?:$|[-_ ])/i.test(member)
      && !/(?:score|full|tutti)/i.test(member)) return 'Instrumental part';
  if (/(?:^|[-_ ])(?:allegro|adagio|andante|largo|presto|gigue|allemande|courante|sarabande|menuet|minuet|gavotte)(?:$|[-_ ])/i.test(member)) return 'Movement';
  if (piece.archiveMembers?.midi) return 'Edition selection';
  return 'Piece / arrangement';
}
