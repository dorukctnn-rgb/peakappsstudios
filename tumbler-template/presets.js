/* Published blank sizes for the template generator (Pro picker) and the size chart page.
 * Rule: only numbers printed on a manufacturer's or blank supplier's own page, copied as published.
 * Every entry cites its page and keeps the published values, field by field, in `published`.
 * All were last checked 7 October 2026. Nothing here is estimated.
 *
 * kind 'wrap'  = the supplier's published wrap/template or imprint size (W x H). It is entered as a
 *                circumference (top = bottom = W) with height H, so the generator reproduces W x H exactly.
 * kind 'body'  = published outside diameters and height of the cup. Overall heights include parts a wrap
 *                can't cover (lip, base), so users must still measure their print height.
 */
window.TumblerPresets = [
  // --- MakerFlo sublimation template chart: https://makerflo.com/pages/sublimation-templates ("Template Size" column) ---
  { group: 'Skinny tumblers', name: '20 oz skinny, straight', kind: 'wrap', top: 9.325, bottom: 9.325, height: 8.125, unit: 'in', measure: 'circumference', paper: '8.5x11',
    source: { label: 'MakerFlo template chart: 20oz Skinny', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '20oz Skinny', paperSize: '8.5x11', templateSize: '9.325 x 8.125' } } },
  { group: 'Skinny tumblers', name: '30 oz skinny, straight', kind: 'wrap', top: 10.3, bottom: 10.3, height: 9.6, unit: 'in', measure: 'circumference', paper: '11x17',
    source: { label: 'MakerFlo template chart: 30oz Skinny', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '30oz Skinny', paperSize: '11x17', templateSize: '10.3 x 9.6' } } },
  { group: 'Skinny tumblers', name: '14 oz skinny, straight', kind: 'wrap', top: 9.8, bottom: 9.8, height: 5.35, unit: 'in', measure: 'circumference', paper: '8.5x11',
    source: { label: 'MakerFlo template chart: 14oz Skinny', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '14oz Skinny', paperSize: '8.5x11', templateSize: '9.8 x 5.35' } } },
  { group: '40 oz tumblers', name: '40 oz tumbler, upper straight piece', kind: 'wrap', top: 12.9, bottom: 12.9, height: 5.75, unit: 'in', measure: 'circumference', paper: '8.5x14',
    source: { label: 'MakerFlo template chart: 40oz Tumbler (top piece)', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '40oz Tumbler', paperSize: '8.5x14', templateSize: 'Top: 12.9 x 5.75, Bottom: 10.3 x 3.6 (tapered)' } } },
  { group: 'Wine, kids and bottles', name: '12 oz wine tumbler', kind: 'wrap', top: 10.2, bottom: 10.2, height: 3.7, unit: 'in', measure: 'circumference', paper: '8.5x11',
    source: { label: 'MakerFlo template chart: 12oz Wine', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '12oz Wine', paperSize: '8.5x11', templateSize: '10.2 x 3.7' } } },
  { group: 'Wine, kids and bottles', name: '12 oz sippy cup', kind: 'wrap', top: 9, bottom: 9, height: 5.1, unit: 'in', measure: 'circumference', paper: '8.5x11',
    source: { label: 'MakerFlo template chart: 12oz Sippy Cup Duo', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '12oz Sippy Cup Duo', paperSize: '8.5x11', templateSize: '9 x 5.1' } } },
  { group: 'Wine, kids and bottles', name: '12 oz slim tumbler', kind: 'wrap', top: 9.33, bottom: 9.33, height: 5.9, unit: 'in', measure: 'circumference', paper: '8.5x11',
    source: { label: 'MakerFlo template chart: 12oz Slim Duozie', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '12oz Slim Duozie', paperSize: '8.5x11', templateSize: '9.33 x 5.9' } } },
  { group: 'Wine, kids and bottles', name: '12 oz thick tumbler', kind: 'wrap', top: 10.1, bottom: 10.1, height: 4.975, unit: 'in', measure: 'circumference', paper: '8.5x11',
    source: { label: 'MakerFlo template chart: 12oz Thick Duozie', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '12oz Thick Duozie', paperSize: '8.5x11', templateSize: '10.1 x 4.975' } } },
  { group: 'Wine, kids and bottles', name: '18 oz bottle', kind: 'wrap', top: 9.55, bottom: 9.55, height: 7.1, unit: 'in', measure: 'circumference', paper: '8.5x11',
    source: { label: 'MakerFlo template chart: 18oz Hydro Bottle', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '18oz Hydro Bottle', paperSize: '8.5x11', templateSize: '9.55 x 7.1' } } },
  { group: 'Wine, kids and bottles', name: '32 oz bottle', kind: 'wrap', top: 11.7, bottom: 11.7, height: 7.8, unit: 'in', measure: 'circumference', paper: '8.5x14',
    source: { label: 'MakerFlo template chart: 32oz Hydro Bottle', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '32oz Hydro Bottle', paperSize: '8.5x14', templateSize: '11.7 x 7.8' } } },
  { group: 'Mugs', name: '12 oz camper mug', kind: 'wrap', top: 11.35, bottom: 11.35, height: 4.35, unit: 'in', measure: 'circumference', paper: '8.5x14',
    source: { label: 'MakerFlo template chart: 12oz Camper Mug', url: 'https://makerflo.com/pages/sublimation-templates', published: { product: '12oz Camper Mug', paperSize: '8.5x14', templateSize: '11.35 x 4.35' } } },

  // --- Mug imprint areas published by the blank makers ---
  { group: 'Mugs', name: '11 oz ceramic mug (imprint area)', kind: 'wrap', top: 8, bottom: 8, height: 3.75, unit: 'in', measure: 'circumference',
    source: { label: 'Condé DyeTrans 11 oz mug (MUG11)', url: 'https://www.conde.com/proddetail.asp?prod=MUG11', published: { imprintableArea: '8" x 3.75"' } } },
  { group: 'Mugs', name: '11 oz mug with colored rim (imprint area)', kind: 'wrap', top: 8.3, bottom: 8.3, height: 3.9, unit: 'in', measure: 'circumference',
    source: { label: 'Coastal Business Supplies 11 oz colored rim/handle mug', url: 'https://www.coastalbusiness.com/white-ceramic-sublimation-coffee-mug-with-color-rim-handle-11oz-27465-g.html', published: { imprintArea: '8.3″ x 3.9″' } } },
  { group: 'Mugs', name: '15 oz ceramic mug (image area)', kind: 'wrap', top: 9.125, bottom: 9.125, height: 4, unit: 'in', measure: 'circumference',
    source: { label: 'Condé DyeTrans 15 oz mug (MUG15)', url: 'https://www.conde.com/proddetail.asp?prod=MUG15', published: { imageArea: '9 1/8" x 4"' } } },
  { group: 'Mugs', name: 'Cricut 12 oz mug blank (max design)', kind: 'wrap', top: 8.75, bottom: 8.75, height: 3.79, unit: 'in', measure: 'circumference',
    source: { label: 'Cricut Mug Press FAQ', url: 'https://help.cricut.com/hc/en-us/articles/360063118153-Cricut-Mug-Press-FAQ', published: { blank: '12 oz (340 ml) mug blank', maxLength: '8.75 in (22.52 cm)', maxHeight: '3.79 in (9.62 cm)' } } },
  { group: 'Mugs', name: 'Cricut 15 oz mug blank (max design)', kind: 'wrap', top: 8.75, bottom: 8.75, height: 4.25, unit: 'in', measure: 'circumference',
    source: { label: 'Cricut Mug Press FAQ', url: 'https://help.cricut.com/hc/en-us/articles/360063118153-Cricut-Mug-Press-FAQ', published: { blank: '15 oz (444 ml) mug blank', maxLength: '8.75 in (22.52 cm)', maxHeight: '4.25 in (10.8 cm)' } } },
  { group: 'Mugs', name: 'Cricut 15 oz beveled mug blank (max design)', kind: 'wrap', top: 8.75, bottom: 8.75, height: 4.17, unit: 'in', measure: 'circumference',
    source: { label: 'Cricut Mug Press FAQ', url: 'https://help.cricut.com/hc/en-us/articles/360063118153-Cricut-Mug-Press-FAQ', published: { blank: '15 oz (444 ml) beveled mug blank', maxLength: '8.75 in (22.52 cm)', maxHeight: '4.17 in (10.59 cm)' } } },
  { group: 'Mugs', name: 'Cricut 10 oz stackable mug blank (max design)', kind: 'wrap', top: 8.75, bottom: 8.75, height: 2.95, unit: 'in', measure: 'circumference',
    source: { label: 'Cricut Mug Press FAQ', url: 'https://help.cricut.com/hc/en-us/articles/360063118153-Cricut-Mug-Press-FAQ', published: { blank: '10 oz (300 ml) stackable mug blank', maxLength: '8.75 in (22.52 cm)', maxHeight: '2.95 in (7.49 cm)' } } },

  // --- Published outside dimensions (diameter + overall height) ---
  { group: 'Body dimensions', name: '20 oz tapered travel tumbler', kind: 'body', top: 3.5, bottom: 3, height: 7, unit: 'in', measure: 'diameter',
    note: 'Overall height; the product page is no longer live (archived copy).',
    source: { label: 'USCutter 20oz Tapered Stainless Steel Travel Tumbler (archived Aug 2025)', url: 'https://web.archive.org/web/20250805170143/https://uscutter.com/20oz-stainless-steel-vacuum-travel-tumbler-w-lid/', published: { height: '7"', diameterDimensions: '3.5" top 3" bottom' } } },
  { group: 'Body dimensions', name: '20 oz skinny, straight', kind: 'body', top: 3, bottom: 3, height: 8.5, unit: 'in', measure: 'diameter',
    note: 'Overall height.',
    source: { label: 'JPPlus Skinny Straight Stainless Steel Tumbler', url: 'https://www.jpplus.com/stainless-steel-tumbler-with-straw-lid', published: { height: '8-1/2"', topDiameter: '3"', baseDiameter: '3"' } } },
  { group: 'Body dimensions', name: '11 oz ceramic mug', kind: 'body', top: 3.1875, bottom: 3.1875, height: 3.75, unit: 'in', measure: 'diameter',
    note: 'Overall height; set a handle gap.',
    source: { label: 'JPPlus 11oz Inner Color Mug', url: 'https://www.jpplus.com/11oz-inner-color-mugs', published: { height: '3-3/4"', topDiameter: '3-3/16"', baseDiameter: '3-3/16"' } } },
  { group: 'Body dimensions', name: '15 oz ceramic mug', kind: 'body', top: 3.25, bottom: 3.25, height: 4.5, unit: 'in', measure: 'diameter',
    note: 'Overall height; set a handle gap.',
    source: { label: 'JPPlus 15oz Inner Color Mug', url: 'https://www.jpplus.com/15oz-interior-color-mug', published: { height: '4-1/2"', topDiameter: '3-1/4"', baseDiameter: '3-1/4"' } } },
];
