import { Category } from '../theme/tokens';

export type Item = {
  id: string;
  title: string;
  description: string;
  name: string;
  location: string;
  category: Category;
  hours: number;
  distance: number;
  urgent: boolean;
  kind: 'Request' | 'Offer';
  period: 'Today' | 'This week';
  height: 'short' | 'medium' | 'tall';
};
const examples: [string, string, Category][] = [
  [
    'A fresh eye on my café menu',
    'Help me turn a handwritten menu into something clear and welcoming.',
    'Skill',
  ],
  [
    'Learn to capture the everyday',
    'A relaxed photography walk. Bring your phone and your curiosity.',
    'Skill',
  ],
  [
    'A little help with the garden',
    'Plant herbs and repot a few plants with my grandmother.',
    'Help',
  ],
  [
    'English, over a cup of chai',
    'Friendly conversation practice for anyone finding their confidence.',
    'Language',
  ],
  [
    'Make a website together',
    'A beginner-friendly introduction to building your first page.',
    'Tech',
  ],
  [
    'Sunday park clean-up',
    'Join neighbours to make our local park a little greener.',
    'Community',
  ],
  [
    'Maths made a little easier',
    'Help a class eight student understand fractions and algebra.',
    'Learning',
  ],
  [
    'A ride to my clinic appointment',
    'Accompany an older neighbour to a scheduled appointment.',
    'Help',
  ],
  [
    'Teach me your favourite recipe',
    'Share a family recipe in a relaxed afternoon cooking session.',
    'Learning',
  ],
  ['Help set up my café POS', 'Walk me through setting up a simple billing system.', 'Tech'],
  [
    'A reading buddy for the library',
    'Read stories with children at our community library.',
    'Community',
  ],
  ['Fix a wobbly bookshelf', 'A small furniture repair. Tools are available at home.', 'Help'],
  ['Malayalam conversation practice', 'A friendly introduction to everyday Malayalam.', 'Language'],
  [
    'Design a poster for our NGO',
    'Create a simple poster for our next community collection.',
    'Skill',
  ],
  [
    'Help organise donated books',
    'Sort and label books before the weekend library opening.',
    'Community',
  ],
];
examples.push(
  [
    'A first lesson on the guitar',
    'Learn three chords and play a favourite song together.',
    'Learning',
  ],
  ['Set up a new phone', 'Help transfer contacts and explain the accessibility settings.', 'Tech'],
  [
    'Stitch a reusable cloth bag',
    'Bring leftover fabric for a relaxed beginner sewing session.',
    'Skill',
  ],
  [
    'Walk with an older neighbour',
    'Enjoy a gentle evening walk and friendly conversation.',
    'Help',
  ],
  [
    'Tamil for everyday conversations',
    'Practice useful phrases with a patient native speaker.',
    'Language',
  ],
  [
    'Record our local history',
    'Help interview elders and organise their stories for the library.',
    'Community',
  ],
  ['A friendly CV review', 'Review a graduate’s CV and practise an introduction.', 'Skill'],
  [
    'Help with balcony plants',
    'Learn about watering, sunlight and growing herbs in small spaces.',
    'Learning',
  ],
  ['Translate a community notice', 'Translate a short English notice into Malayalam.', 'Language'],
  ['Repair a bicycle puncture', 'Show me how to patch a tube and check the brakes.', 'Help'],
  [
    'Teach basic spreadsheet skills',
    'A practical session on lists, sums and household planning.',
    'Tech',
  ],
  [
    'Pack food for our community kitchen',
    'Help prepare and pack meals with our local volunteer group.',
    'Community',
  ],
  [
    'Practise an interview together',
    'A relaxed mock interview with constructive feedback.',
    'Learning',
  ],
  [
    'Sketch our neighbourhood',
    'Meet for a gentle introduction to drawing local buildings.',
    'Skill',
  ],
  [
    'Sort clothing donations',
    'Fold and organise donations for the weekend collection.',
    'Community',
  ],
);
const names = [
  'Amina Rahman',
  'Arjun Nair',
  'Meera Menon',
  'Farhan Ali',
  'Lakshmi Kumar',
  'Ravi Sharma',
  'Anjali Das',
  'Nikhil Thomas',
  'Priya Iyer',
  'Sana Basheer',
];
const places = [
  'Kozhikode',
  'Calicut',
  'Manancherry',
  'Kochi',
  'Thiruvananthapuram',
  'Kozhikode',
  'Calicut',
  'Chennai',
  'Bengaluru',
  'Kozhikode',
];
export const demoItems: Item[] = Array.from({ length: 30 }, (_, index) => {
  const [title, description, category] = examples[index % examples.length];
  return {
    id: `demo-${index}`,
    title,
    description,
    category,
    name: names[index % names.length],
    location: places[index % places.length],
    hours: [2, 1.5, 1, 0.5, 3, 4][index % 6],
    distance: Number((0.4 + index * 0.3).toFixed(1)),
    urgent: index === 7 || index === 9,
    kind: index % 3 === 1 ? 'Offer' : 'Request',
    period: index < 10 ? 'Today' : 'This week',
    height: (['medium', 'tall', 'short'] as const)[index % 3],
  };
});
export const contributions = [
  {
    title: 'Design support for an NGO',
    date: 'Oct 28',
    hours: 3,
    category: 'Skill' as Category,
    status: 'Completed',
  },
  {
    title: 'Photography for a community event',
    date: 'Oct 20',
    hours: 2,
    category: 'Skill' as Category,
    status: 'Completed',
  },
  {
    title: 'Mentored a student',
    date: 'Oct 15',
    hours: 1,
    category: 'Learning' as Category,
    status: 'Completed',
  },
  {
    title: 'Community library website',
    date: 'Nov 03',
    hours: 2,
    category: 'Tech' as Category,
    status: 'In progress',
  },
];
