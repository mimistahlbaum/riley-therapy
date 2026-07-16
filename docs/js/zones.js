// Zones of Regulation data model.
// The original 2025 demo implemented the Yellow Zone only; this version
// implements all four zones with feelings and regulation activities.

export const ZONES = {
  blue: {
    id: 'blue',
    name: 'Blue Zone',
    emoji: '💙',
    color: 0x4f8ef7,
    css: '#4F8EF7',
    cssSoft: '#E3EEFF',
    tagline: 'Low energy',
    description:
      'The Blue Zone is when your body feels slow or low. You might feel sad, tired, sick or bored. It is okay to be here. Gentle movement and care can help your body wake up or feel comforted.',
    feelings: [
      { id: 'sad', label: 'Sad', emoji: '😢' },
      { id: 'tired', label: 'Tired', emoji: '😴' },
      { id: 'sick', label: 'Sick', emoji: '🤒' },
      { id: 'bored', label: 'Bored', emoji: '🥱' },
      { id: 'lonely', label: 'Lonely', emoji: '🫂' },
    ],
    activities: ['stretch', 'talk', 'cozy', 'count'],
  },
  green: {
    id: 'green',
    name: 'Green Zone',
    emoji: '💚',
    color: 0x34c759,
    css: '#34C759',
    cssSoft: '#E4F8EA',
    tagline: 'Calm and ready',
    description:
      'The Green Zone is when you feel calm, happy, focused and ready to learn or play. This is a great zone to be in. You can practise things here that help you when other zones feel big.',
    feelings: [
      { id: 'happy', label: 'Happy', emoji: '😊' },
      { id: 'calm', label: 'Calm', emoji: '😌' },
      { id: 'focused', label: 'Focused', emoji: '🤓' },
      { id: 'proud', label: 'Proud', emoji: '🥰' },
    ],
    activities: ['gratitude', 'mindful', 'breathing'],
  },
  yellow: {
    id: 'yellow',
    name: 'Yellow Zone',
    emoji: '💛',
    color: 0xf5c518,
    css: '#EAB308',
    cssSoft: '#FDF6D8',
    tagline: 'Wiggly and worried',
    description:
      'The Yellow Zone is when your engine starts running fast. You might feel worried, frustrated, silly or super excited. Your body is telling you something. Slowing-down tools can help you feel steady again.',
    feelings: [
      { id: 'worried', label: 'Worried', emoji: '😟' },
      { id: 'frustrated', label: 'Frustrated', emoji: '😤' },
      { id: 'excited', label: 'Excited', emoji: '🤩' },
      { id: 'silly', label: 'Silly', emoji: '🤪' },
      { id: 'nervous', label: 'Nervous', emoji: '😬' },
    ],
    activities: ['breathing', 'grounding', 'squeeze', 'count'],
  },
  red: {
    id: 'red',
    name: 'Red Zone',
    emoji: '❤️',
    color: 0xef4444,
    css: '#EF4444',
    cssSoft: '#FDE4E4',
    tagline: 'Big feelings',
    description:
      'The Red Zone is when feelings are very big and strong, like anger or fear. Everyone visits the Red Zone sometimes. Strong-body tools and big breaths can help the feeling pass safely.',
    feelings: [
      { id: 'angry', label: 'Angry', emoji: '😡' },
      { id: 'scared', label: 'Scared', emoji: '😨' },
      { id: 'overwhelmed', label: 'Out of control', emoji: '🌪️' },
      { id: 'furious', label: 'Furious', emoji: '🤬' },
    ],
    activities: ['dragon', 'pushwall', 'countdown', 'grounding'],
  },
};

export const ZONE_ORDER = ['blue', 'green', 'yellow', 'red'];

// Map feeling id -> zone id for quick lookup.
export const FEELING_TO_ZONE = {};
for (const zone of Object.values(ZONES)) {
  for (const feeling of zone.feelings) {
    FEELING_TO_ZONE[feeling.id] = zone.id;
  }
}

export function feelingById(id) {
  for (const zone of Object.values(ZONES)) {
    const f = zone.feelings.find((x) => x.id === id);
    if (f) return f;
  }
  return null;
}

// Regulation activities. type drives the ActivityRunner:
//  - breathing: guided breath cycles (drives the balloon/heart animation)
//  - steps: a sequence of prompts the child taps through
//  - count: counting together, one tap per number
export const ACTIVITIES = {
  breathing: {
    id: 'breathing',
    name: 'Balloon breathing',
    emoji: '🎈',
    type: 'breathing',
    cycles: 4,
    inhale: 4,
    hold: 2,
    exhale: 4,
    intro: 'Let’s do balloon breathing together. Watch the balloon and breathe with it.',
    outro: 'You did it! Balloon breathing tells your body it is safe to slow down.',
    blurb: 'Slow breaths in and out, like blowing up a gentle balloon.',
  },
  dragon: {
    id: 'dragon',
    name: 'Dragon breaths',
    emoji: '🐉',
    type: 'breathing',
    cycles: 3,
    inhale: 3,
    hold: 1,
    exhale: 5,
    intro: 'Time for dragon breaths! Take a big breath in, then blow it all out slowly like a friendly dragon.',
    outro: 'Wow, what strong dragon breaths! Big feelings get smaller when we breathe them out.',
    blurb: 'Big breath in, long slow blow out. Great for big feelings.',
  },
  grounding: {
    id: 'grounding',
    name: '5-4-3-2-1 grounding',
    emoji: '🖐️',
    type: 'steps',
    intro: 'Let’s play 5-4-3-2-1. It helps your brain come back to right now.',
    outro: 'Nice noticing! Your brain is back in the room with me.',
    blurb: 'Notice 5 things you can see, 4 you can touch, and more.',
    steps: [
      { text: 'Look around. Can you find 5 things you can SEE? Say them out loud or in your head.', button: 'Found 5 things 👀' },
      { text: 'Now find 4 things you can TOUCH. Maybe your shirt, a chair, or your own hands.', button: 'Touched 4 things ✋' },
      { text: 'Listen carefully... what are 3 things you can HEAR?', button: 'Heard 3 things 👂' },
      { text: 'Take a sniff! What are 2 things you can SMELL? (Or 2 smells you like.)', button: 'Smelled 2 things 👃' },
      { text: 'Last one: 1 thing you can TASTE, or your favourite taste ever.', button: 'Done! 👅' },
    ],
  },
  count: {
    id: 'count',
    name: 'Count to 10 with me',
    emoji: '🔢',
    type: 'count',
    from: 1,
    to: 10,
    intro: 'Let’s count to 10 together, nice and slowly. Tap for each number.',
    outro: 'Ten! Counting slowly gives feelings time to settle.',
    blurb: 'Count slowly together, one tap at a time.',
  },
  countdown: {
    id: 'countdown',
    name: 'Rocket countdown',
    emoji: '🚀',
    type: 'count',
    from: 10,
    to: 1,
    intro: 'Let’s do a rocket countdown from 10. With every number, let a little bit of the big feeling blast away.',
    outro: 'Lift off! Did some of that big feeling blast away with the rocket?',
    blurb: 'Count down from 10 and blast the big feeling away.',
  },
  squeeze: {
    id: 'squeeze',
    name: 'Squeeze and let go',
    emoji: '🍋',
    type: 'steps',
    intro: 'Let’s squeeze the wiggles out. Pretend you have a lemon in each hand.',
    outro: 'Great squeezing! Your muscles feel looser now, don’t they?',
    blurb: 'Squeeze your muscles tight, then let them go soft.',
    steps: [
      { text: 'Squeeze your hands into tight fists, like squeezing lemons... hold it... and let go. Shake your hands out!', button: 'Squeezed! 🍋' },
      { text: 'Now scrunch your shoulders up to your ears... hold... and drop them down with a big sigh.', button: 'Dropped! 😮‍💨' },
      { text: 'Squeeze your whole body like a robot... 3, 2, 1... now go floppy like spaghetti!', button: 'Floppy! 🍝' },
    ],
  },
  pushwall: {
    id: 'pushwall',
    name: 'Push the wall',
    emoji: '🧱',
    type: 'steps',
    intro: 'When feelings are really strong, our muscles want a job. Let’s give them one!',
    outro: 'Strong work! Pushing hard helps big feelings move out of your body safely.',
    blurb: 'Push hard against a wall to let strong feelings out safely.',
    steps: [
      { text: 'Find a wall (or the floor). Put both hands flat on it.', button: 'Ready 🙌' },
      { text: 'Now PUSH as hard as you can while I count... 1... 2... 3... 4... 5! And relax.', button: 'Pushed! 💪' },
      { text: 'One more time, even stronger! Push... push... push... and let go. Shake your arms out.', button: 'Done! 🎉' },
    ],
  },
  stretch: {
    id: 'stretch',
    name: 'Star stretch',
    emoji: '⭐',
    type: 'steps',
    intro: 'Let’s wake your body up gently with a star stretch.',
    outro: 'Twinkle twinkle! A little movement helps sleepy bodies feel brighter.',
    blurb: 'Gentle stretches to wake up a slow, sleepy body.',
    steps: [
      { text: 'Stand up if you can. Reach your arms up high like you’re touching the sky.', button: 'Reaching! 🙆' },
      { text: 'Now spread your arms and legs out wide like a big star. Hold it and smile!', button: 'I’m a star ⭐' },
      { text: 'Wiggle your fingers, wiggle your toes, and give yourself a big hug.', button: 'Hugged! 🤗' },
    ],
  },
  cozy: {
    id: 'cozy',
    name: 'Cozy care',
    emoji: '🧸',
    type: 'steps',
    intro: 'When we feel low, our body might need some cozy care.',
    outro: 'Being kind to yourself is a superpower. I’m proud of you.',
    blurb: 'Little kind things to comfort yourself when feeling low.',
    steps: [
      { text: 'Is your body thirsty? A little sip of water can help. (You can pretend if there’s none nearby.)', button: 'Sipped 💧' },
      { text: 'Find something soft: a jumper, a teddy, a pillow. Give it a squeeze.', button: 'Squeezed 🧸' },
      { text: 'Put a hand on your heart and say: “It’s okay to feel this way. Feelings come and go.”', button: 'Said it 💗' },
    ],
  },
  talk: {
    id: 'talk',
    name: 'Talk it out',
    emoji: '💬',
    type: 'steps',
    intro: 'Sometimes feelings get lighter when we share them.',
    outro: 'Thank you for sharing with me. Sharing with a grown-up you trust helps even more.',
    blurb: 'Practise putting your feeling into words.',
    steps: [
      { text: 'Can you finish this sentence, out loud or in your head? “I feel ___ because ___.”', button: 'I said it 💬' },
      { text: 'Who is a person you trust? A parent, a teacher, a friend? Picture their face.', button: 'Got someone 🙂' },
      { text: 'Next time you see them, you could tell them what you told me. You don’t have to carry feelings alone.', button: 'I’ll try 💪' },
    ],
  },
  gratitude: {
    id: 'gratitude',
    name: 'Three happy things',
    emoji: '🌟',
    type: 'steps',
    intro: 'You’re in a lovely calm zone! Let’s collect some happy things to remember.',
    outro: 'What a lovely collection! Thinking of happy things helps our brain grow strong.',
    blurb: 'Think of three things that made you smile.',
    steps: [
      { text: 'Think of 1 thing that made you smile today. Got it?', button: 'Got one 😊' },
      { text: 'Now a person or animal you love. Picture them clearly!', button: 'Picturing 💞' },
      { text: 'And something you’re looking forward to. Hold all three in your mind like treasures.', button: 'Treasured 🌟' },
    ],
  },
  mindful: {
    id: 'mindful',
    name: 'Mindful minute',
    emoji: '🧘',
    type: 'breathing',
    cycles: 3,
    inhale: 4,
    hold: 4,
    exhale: 4,
    intro: 'Let’s enjoy a quiet mindful minute together. Just you, me, and slow square breathing.',
    outro: 'Lovely and calm. You can take a mindful minute anywhere, any time.',
    blurb: 'A quiet minute of slow, square breathing.',
  },
};

export function activitiesForZone(zoneId) {
  return (ZONES[zoneId]?.activities || []).map((id) => ACTIVITIES[id]).filter(Boolean);
}
