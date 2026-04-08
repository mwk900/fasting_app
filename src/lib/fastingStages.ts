export interface FastingBenefit {
  level: 'STRONG' | 'MODERATE' | 'WEAK' | 'WEAK_MODERATE'
  text: string
}

export interface FastingStage {
  id: number
  title: string
  hoursStart: number
  hoursEnd: number
  summary: string
  whatsHappening: string[]
  benefits: FastingBenefit[]
  tips: string[]
  warning?: string
}

export const FASTING_STAGES: FastingStage[] = [
  {
    id: 1,
    title: 'Fed State',
    hoursStart: 0,
    hoursEnd: 4,
    summary:
      'Digesting and absorbing your last meal. Insulin elevated, body in anabolic/storage mode.',
    whatsHappening: [
      'Digesting and absorbing your last meal',
      'Insulin elevated, mTOR active (anabolic/storage mode)',
      'Blood glucose rising then plateauing',
      'Excess glucose stored as liver + muscle glycogen',
      'Ghrelin (hunger hormone) drops 1\u20132h post-meal',
    ],
    benefits: [],
    tips: [
      'Make your last meal count: moderate protein, low-to-moderate carbs makes the transition smoother.',
      "Don't stuff yourself \"because you won't eat for X hours\". Bigger last meal = longer to deplete glycogen = slower to the useful stages.",
    ],
  },
  {
    id: 2,
    title: 'Early Fasting',
    hoursStart: 4,
    hoursEnd: 12,
    summary:
      'Digestion finishing. Insulin dropping, liver releasing stored glycogen. Gut cleaning wave activating.',
    whatsHappening: [
      'Digestion finishing',
      'Insulin dropping, glucagon rising',
      'Liver starts releasing stored glycogen (glycogenolysis)',
      'Migrating motor complex (MMC) activates \u2014 gut \u201ccleaning wave\u201d',
      'By hour ~12, ketones become measurable in blood',
    ],
    benefits: [
      { level: 'STRONG', text: 'Insulin coming down \u2014 early metabolic rest' },
      { level: 'MODERATE', text: 'Gut motility / digestive rest' },
    ],
    tips: [
      'Hour 8 is the classic \u201cfirst dip\u201d \u2014 hunger, low energy, brain fog. It passes. Don\u2019t snack through it.',
      'Coffee or green tea here helps. Black, no milk, no sweetener.',
      'Keep moving \u2014 light activity uses glycogen faster and gets you to fat-burning quicker.',
    ],
  },
  {
    id: 3,
    title: 'Metabolic Switch',
    hoursStart: 12,
    hoursEnd: 18,
    summary:
      'Liver glycogen running out. Fat mobilisation ramping up, first ketones entering circulation.',
    whatsHappening: [
      'Liver glycogen running out',
      'Lipolysis ramping up: stored triglycerides break into free fatty acids + glycerol',
      'Counter-regulatory hormones rising: glucagon, epinephrine, growth hormone, cortisol',
      'First ketones (beta-hydroxybutyrate) entering circulation',
    ],
    benefits: [
      { level: 'STRONG', text: 'Active fat mobilisation begins' },
      { level: 'STRONG', text: 'Insulin at low levels \u2014 improving sensitivity' },
      {
        level: 'MODERATE',
        text: 'Norepinephrine slightly elevated \u2192 mild metabolic rate boost',
      },
    ],
    tips: [
      'Hour 14\u201316: first electrolyte top-up if symptomatic. A pinch of salt in water often kills the early headache.',
      'Hydrate to thirst, not on a schedule. Overdrinking dilutes sodium and makes things worse.',
      "Don\u2019t exercise hard here \u2014 you\u2019re between fuel sources. Walking is fine. Heavy lifting will feel like garbage.",
    ],
  },
  {
    id: 4,
    title: 'Ketosis Begins',
    hoursStart: 18,
    hoursEnd: 24,
    summary:
      'Glycogen mostly depleted. Liver converting fatty acids to ketone bodies. Autophagy markers appearing.',
    whatsHappening: [
      'Glycogen mostly depleted',
      'Liver converting fatty acids \u2192 ketone bodies (BHB, acetoacetate)',
      'Gluconeogenesis active (liver makes glucose from glycerol, lactate, amino acids)',
      'AMPK (cellular energy sensor) activating \u2014 suppresses mTOR',
      'Early autophagy markers begin appearing',
      'Blood ketones reach ~0.5\u20131.5 mmol/L for most',
    ],
    benefits: [
      { level: 'STRONG', text: 'Significant insulin reduction' },
      { level: 'STRONG', text: 'Fat oxidation now dominant fuel pathway' },
      { level: 'MODERATE', text: 'Autophagy starting (timing in humans is approximate)' },
      { level: 'MODERATE', text: 'Inflammatory cytokines starting to drop' },
    ],
    tips: [
      'This is where most of the benefits of a 16:8 protocol cap out.',
      'You may pee more \u2014 fat release pulls bound water with it.',
      'Hour 20: second electrolyte dose. 1\u20132g sodium is reasonable if symptomatic.',
      'Headache here is almost always sodium, not \u201ctoxins\u201d.',
    ],
  },
  {
    id: 5,
    title: 'Established Ketosis',
    hoursStart: 24,
    hoursEnd: 36,
    summary:
      'Ketones rising significantly. Brain shifting to ketone fuel. Growth hormone pulses increasing.',
    whatsHappening: [
      'Ketones rising significantly (1\u20133 mmol/L territory)',
      'Brain shifting to ketone fuel \u2014 many report mental clarity here',
      'Growth hormone pulses increasing',
      'Autophagy markers detectable in white blood cells',
      'Inflammatory cytokine reduction becoming measurable',
    ],
    benefits: [
      { level: 'STRONG', text: 'Deep insulin suppression \u2014 pancreatic rest' },
      { level: 'STRONG', text: 'Sustained fat oxidation' },
      { level: 'MODERATE', text: 'Growth hormone rise (preserves lean mass)' },
      { level: 'MODERATE', text: 'Reduced inflammation markers' },
      { level: 'MODERATE', text: 'Autophagy active (magnitude in humans uncertain)' },
      { level: 'WEAK', text: 'BDNF / brain benefits (mostly animal data)' },
    ],
    tips: [
      'Hour 24\u201330: mood often improves and hunger drops. Ketones suppress appetite via the hypothalamus.',
      'Hour 30 is the key electrolyte window. Sodium: 1\u20132g, Magnesium: 200\u2013400mg (glycinate/citrate), Potassium: 200\u2013400mg.',
      'Magnesium in the evening helps with sleep + cramping.',
      'Sleep can get weird \u2014 lighter, more vivid dreams. Normal.',
      'Cold tolerance drops. Layer up.',
    ],
  },
  {
    id: 6,
    title: 'Deeper Ketosis',
    hoursStart: 36,
    hoursEnd: 48,
    summary:
      'Deep ketosis. Tissue insulin sensitivity upregulating. Autophagy progressively increasing.',
    whatsHappening: [
      'Ketones often 2\u20135 mmol/L',
      'Body in efficient fat-burning mode',
      'Tissue insulin sensitivity starts upregulating',
      'Autophagy progressively increasing',
      'Hunger often paradoxically lower than at hour 24',
    ],
    benefits: [
      { level: 'STRONG', text: 'Substantial insulin sensitivity improvement' },
      { level: 'STRONG', text: 'Significant fat loss (real fat, not just water)' },
      { level: 'STRONG', text: 'Lipid profile improvements (with repeated fasting)' },
      { level: 'MODERATE', text: 'Growth hormone meaningfully elevated' },
      { level: 'MODERATE', text: 'More established autophagy' },
    ],
    tips: [
      'Solid stopping point \u2014 most metabolic benefit, low risk.',
      'If going past 48h, start tracking how you feel more carefully. Dizziness on standing = need salt + water.',
      'Resist the urge to do hard training. Recovery is harder fasted.',
      'Hour 40\u201348: third meaningful electrolyte dose.',
    ],
  },
  {
    id: 7,
    title: 'Extended Fast',
    hoursStart: 48,
    hoursEnd: 72,
    summary:
      'Deep ketosis established. Autophagy ramping toward peak. Early stem cell activation signals.',
    whatsHappening: [
      'Deep ketosis well established (3\u20136 mmol/L possible)',
      'Growth hormone elevated and pulsing more frequently',
      'Autophagy ramping toward its peak window',
      'Sodium excretion via kidneys peaks around day 4',
      'Some early stem cell activation signals (small human studies + mouse data)',
    ],
    benefits: [
      { level: 'STRONG', text: 'Maximum insulin sensitivity reset effect' },
      { level: 'MODERATE', text: 'Peak autophagy zone (timing imprecise in humans)' },
      { level: 'MODERATE', text: 'Growth hormone elevation' },
      { level: 'WEAK_MODERATE', text: 'Immune cell turnover' },
      { level: 'WEAK', text: 'Stem cell activation (mostly mouse data)' },
    ],
    tips: [
      'Electrolytes are non-negotiable. Sodium: 2\u20134g/day, Magnesium: 300\u2013500mg/day, Potassium: 500\u20131000mg/day. Split across multiple doses.',
      'Stand up slowly. Orthostatic hypotension is common.',
      'Hour 50\u201360: many report a \u201csecond wind\u201d \u2014 energy and clarity often improve.',
      'Skip the gym. Walking and mobility only.',
      'Sleep often degrades around hours 60\u201372. Magnesium glycinate before bed helps.',
      'Stop signs: irregular heartbeat, severe weakness, confusion. These are not \u201cpush through\u201d signs.',
    ],
  },
  {
    id: 8,
    title: 'Deep Extended',
    hoursStart: 72,
    hoursEnd: Infinity,
    summary:
      'Maximum metabolic adaptation. Autophagy in peak zone. Approaching refeeding syndrome risk threshold.',
    whatsHappening: [
      'Maximum metabolic adaptation to fat/ketones',
      'Autophagy considered to be in its peak zone',
      'IGF-1 dropping toward baseline lows',
      'Protein-sparing mechanisms maximised (but some lean tissue catabolism inevitable)',
      'Resting heart rate often drops; blood pressure can drop',
    ],
    benefits: [
      { level: 'MODERATE', text: 'Peak autophagy window (precise human timing data is thin)' },
      { level: 'MODERATE', text: 'Maximum insulin sensitivity gains' },
      { level: 'WEAK_MODERATE', text: 'Immune system \u201creset\u201d effects (post-refeed)' },
    ],
    tips: [
      'Have someone who knows you check in regularly.',
      'Electrolytes are critical. Sodium: 3\u20135g/day, Magnesium: 400\u2013500mg/day, Potassium: 1000mg/day.',
      'Cold sensitivity peaks. Hot showers, layers.',
      'Mood dips at 72h+ are normal \u2014 it\u2019s the fast, not your life. Passes on refeed.',
      'Plan your refeed BEFORE you reach this point.',
    ],
    warning:
      'NICE (UK) classifies >5 days with little/no intake as \u201cat risk\u201d of refeeding syndrome \u2014 a real, potentially fatal condition involving rapid drops in phosphate, potassium, and magnesium when food returns. A 100h fast (~4.2 days) is right at this threshold. Plan your refeed carefully.',
  },
]

export const ELECTROLYTE_REFERENCE: { symptom: string; cause: string; fix: string }[] = [
  { symptom: 'Headache (hours 12\u201330)', cause: 'Sodium', fix: '1\u20132g salt in water' },
  {
    symptom: 'Muscle cramps',
    cause: 'Magnesium and/or sodium',
    fix: '300mg Mg + salt',
  },
  {
    symptom: 'Heart palpitations',
    cause: 'Potassium and/or magnesium',
    fix: 'KCl + Mg',
  },
  {
    symptom: 'Dizzy on standing',
    cause: 'Sodium + dehydration',
    fix: 'Salt + water',
  },
  { symptom: 'Insomnia', cause: 'Magnesium', fix: '300\u2013500mg glycinate at night' },
  { symptom: 'Fatigue / weakness', cause: 'Usually sodium', fix: 'Salt' },
  {
    symptom: 'Constipation post-fast',
    cause: 'Magnesium',
    fix: 'Mg citrate',
  },
]

export const REFEED_PROTOCOL = [
  {
    time: 'Breaking the fast',
    instructions: 'Small amount of bone broth or salted water. 100\u2013200 kcal max. Wait 30\u201360 min.',
  },
  {
    time: 'Hour 1\u20132',
    instructions:
      'Small portion of easily digested protein + fat. Eggs, Greek yogurt, avocado. Avoid large carb bolus.',
  },
  {
    time: 'Hour 4\u20136',
    instructions: 'Slightly larger meal. Still moderate carbs. Continue electrolytes.',
  },
  {
    time: 'Hour 12+',
    instructions:
      "Resume normal eating. Don\u2019t refeed binge \u2014 stomach has shrunk and insulin response is heightened.",
  },
]

export function getStageForHour(hours: number): FastingStage {
  for (const stage of FASTING_STAGES) {
    if (hours < stage.hoursEnd) return stage
  }
  return FASTING_STAGES[FASTING_STAGES.length - 1]
}
