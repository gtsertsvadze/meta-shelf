import readme from '../content/README.md';
import medcurve from '../content/medcurve.md';
import pixelShelf from '../content/pixel-shelf.md';
import thumbnailX from '../content/thumbnail-x.md';
import tomfoolery from '../content/tomfoolery.md';
import wavesay from '../content/wavesay.md';

// Normalise line endings so a CRLF checkout still seeds files the validator accepts.
const lf = s => s.replace(/\r\n/g, '\n');

export const SEEDS = {
  'README.md': lf(readme),
  'pixel-shelf.md': lf(pixelShelf),
  'tomfoolery.md': lf(tomfoolery),
  'thumbnail-x.md': lf(thumbnailX),
  'medcurve.md': lf(medcurve),
  'wavesay.md': lf(wavesay),
};
