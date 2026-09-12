// Seed topics for the word search picker, aimed at ~10-13 year olds. Curating
// the common path means kid-entered free text stays the exception rather than
// the default, which keeps the moderation surface small.
export const wordSearchTopics: string[] = [
  // Music
  'Pop song titles',
  'Taylor Swift songs',
  'Music genres',
  'Musical instruments',
  'Concert and stage words',
  'Dance moves',
  'K-pop groups',
  'Music awards',
  'Singing and choir words',
  'Making a playlist',

  // Cats and animals
  'Cat breeds',
  'Kitten care',
  'Cat behaviour',
  'Big cats of the world',
  'Dog breeds',
  'Baby animal names',
  'Ocean animals',
  'Rainforest animals',
  'Farm animals',
  'Birds in the backyard',
  'Bugs and insects',
  'Reptiles and amphibians',
  'Horses and riding',
  'Pet supplies',
  'Animals at the zoo',

  // Screen time
  'Disney princesses',
  'Pixar movies',
  'Marvel superheroes',
  'Star Wars characters',
  'Disney villains',
  'Animated movie characters',
  'Superhero powers',
  'Fantasy creatures',
  'Anime favourites',
  'Movie theatre words',
  'Making a movie',
  'Binge-watching words',
  'Talent show words',
  'Video game characters',

  // Cross country, track and lacrosse
  'Cross country running',
  'Track and field events',
  'Race day words',
  'Running shoes and gear',
  'Lacrosse gear',
  'Lacrosse positions',
  'Stretching and warm ups',
  'Coaching words',
  'Trophies and medals',
  'Relay races',

  // Other sports
  'Team sports',
  'Olympic sports',
  'Soccer words',
  'Basketball words',
  'Swimming words',
  'Gymnastics',
  'Volleyball',
  'Winter sports',
  'Skateboarding',
  'Biking and BMX',
  'Tennis words',
  'Sports first aid',

  // School
  'School subjects',
  'Classroom supplies',
  'Library words',
  'Science lab equipment',
  'Math words',
  'Grammar words',
  'Geography words',
  'US states',
  'World capitals',
  'Ancient Egypt',
  'Ancient Rome',
  'The solar system',
  'Weather words',
  'Rocks and minerals',
  'Parts of the human body',
  'Plants and trees',
  'Famous inventors',
  'Coding words',
  'Recycling and the environment',
  'Field trip words',

  // Food
  'Ice cream flavours',
  'Pizza toppings',
  'Breakfast foods',
  'Candy and sweets',
  'Fruits and vegetables',
  'Baking words',
  'Snack foods',
  'Food trucks',

  // Everything else
  'Board games',
  'Art supplies',
  'Crafts and DIY',
  'Camping gear',
  'A day at the beach',
  'Summer vacation',
  'Amusement parks',
  'Birthday parties',
  'Halloween',
  'Winter holidays',
  'Emotions and feelings',
  'Friendship words',
  'Sleepover words',
  'Rainy day activities',
  'Road trip words',
  'Space travel',
  'Under the sea',
  'Dinosaurs',
  'Weather disasters',
  'Around the world',
];

export function pickRandomTopics(count: number): string[] {
  const pool = [...wordSearchTopics];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}
