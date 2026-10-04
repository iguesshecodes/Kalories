// Food database. Values are per 100 g (or 100 ml) as typically cooked at home in India,
// built from IFCT 2017 and USDA FoodData Central ranges, rounded. Treat them as good estimates:
// home cooking varies, so weigh when you can and use Quick add for exact label numbers.
//
// Row format: [name, category, diet, kcal, protein, carbs, fat, [[portion label, grams], ...], search aliases]
// diet: v = vegetarian, e = contains egg, n = contains meat or fish

export const CATS = [
  ['all', 'All'],
  ['bf', 'Breakfast'],
  ['grain', 'Rotis and rice'],
  ['curry', 'Dal and curry'],
  ['protein', 'Protein'],
  ['snack', 'Snacks'],
  ['sweet', 'Sweets'],
  ['fruit', 'Fruit and veg'],
  ['drink', 'Dairy and drinks']
];

const RAW = [
  // Breakfast
  ['Idli', 'bf', 'v', 140, 4.5, 28, 0.6, [['1 idli (40 g)', 40], ['2 idlis (80 g)', 80]], 'idly south indian'],
  ['Plain dosa', 'bf', 'v', 168, 3.9, 29, 3.7, [['1 dosa (90 g)', 90]], 'dosai'],
  ['Masala dosa', 'bf', 'v', 190, 4, 28, 7, [['1 dosa with filling (180 g)', 180]], 'potato dosa'],
  ['Uttapam', 'bf', 'v', 190, 5, 29, 6, [['1 uttapam (120 g)', 120]], 'uthappam'],
  ['Medu vada', 'bf', 'v', 290, 8, 26, 17, [['1 vada (40 g)', 40]], 'vadai urad'],
  ['Upma', 'bf', 'v', 142, 3.5, 22, 4.5, [['1 katori (150 g)', 150], ['1 plate (250 g)', 250]], 'suji rava'],
  ['Poha (with peanuts)', 'bf', 'v', 145, 3.5, 25, 3.5, [['1 plate (150 g)', 150], ['1 katori (100 g)', 100]], 'flattened rice aval'],
  ['Besan chilla', 'bf', 'v', 204, 9, 24, 8, [['1 chilla (60 g)', 60]], 'cheela gram flour pudla'],
  ['Moong dal chilla', 'bf', 'v', 170, 9, 22, 5, [['1 chilla (60 g)', 60]], 'cheela green gram'],
  ['Thepla', 'bf', 'v', 297, 9, 45, 9, [['1 thepla (40 g)', 40]], 'methi gujarati'],
  ['Dhokla', 'bf', 'v', 160, 6, 25, 4, [['1 piece (30 g)', 30], ['4 pieces (120 g)', 120]], 'khaman gujarati'],
  ['Rolled oats (dry)', 'bf', 'v', 389, 16.9, 66, 6.9, [['1 serving (40 g)', 40], ['1 tbsp (10 g)', 10]], 'oatmeal quaker'],
  ['Oats porridge with milk', 'bf', 'v', 85, 4, 11, 2.8, [['1 bowl (250 g)', 250]], 'oatmeal cooked'],
  ['Daliya (cooked)', 'bf', 'v', 90, 3, 18, 0.6, [['1 katori (150 g)', 150], ['1 bowl (250 g)', 250]], 'broken wheat porridge dalia'],
  ['Cornflakes', 'bf', 'v', 357, 7.5, 84, 0.4, [['1 bowl (30 g)', 30]], 'cereal kelloggs'],
  ['Maggi noodles (packet)', 'bf', 'v', 443, 9.5, 60, 17, [['1 small packet (70 g dry)', 70]], 'instant noodles masala'],
  ['Pasta (cooked)', 'bf', 'v', 158, 5.8, 31, 0.9, [['1 plate (180 g)', 180]], 'macaroni penne spaghetti'],
  ['Bread, white', 'bf', 'v', 265, 9, 49, 3.2, [['1 slice (28 g)', 28]], 'sandwich bread'],
  ['Bread, whole wheat', 'bf', 'v', 250, 11, 43, 3.5, [['1 slice (30 g)', 30]], 'brown bread atta'],
  ['Pav', 'bf', 'v', 285, 8.5, 50, 5, [['1 pav (40 g)', 40]], 'ladi bun'],

  // Rotis and rice
  ['Roti / chapati (plain)', 'grain', 'v', 290, 9.5, 56, 3.5, [['1 medium roti (40 g)', 40], ['1 phulka (30 g)', 30]], 'phulka fulka'],
  ['Paratha (plain)', 'grain', 'v', 326, 7.5, 48, 12, [['1 paratha (80 g)', 80]], 'parantha'],
  ['Aloo paratha', 'grain', 'v', 270, 6, 38, 10.5, [['1 paratha (110 g)', 110]], 'potato stuffed'],
  ['Paneer paratha', 'grain', 'v', 285, 9, 33, 13, [['1 paratha (110 g)', 110]], 'cottage cheese stuffed'],
  ['Puri', 'grain', 'v', 400, 7, 47, 20, [['1 puri (25 g)', 25], ['3 puris (75 g)', 75]], 'poori fried bread'],
  ['Naan (plain)', 'grain', 'v', 290, 9, 50, 5.5, [['1 naan (90 g)', 90]], 'tandoori'],
  ['Butter naan', 'grain', 'v', 320, 8.5, 48, 10, [['1 naan (100 g)', 100]], ''],
  ['Kulcha', 'grain', 'v', 300, 8, 50, 7, [['1 kulcha (80 g)', 80]], 'amritsari'],
  ['White rice (cooked)', 'grain', 'v', 130, 2.7, 28, 0.3, [['1 katori (150 g)', 150], ['1 plate (200 g)', 200], ['1 tbsp (20 g)', 20]], 'chawal bhaat steamed'],
  ['Brown rice (cooked)', 'grain', 'v', 123, 2.7, 25.6, 1, [['1 katori (150 g)', 150], ['1 plate (200 g)', 200]], 'chawal'],
  ['Jeera rice', 'grain', 'v', 150, 3, 28, 3, [['1 katori (150 g)', 150], ['1 plate (200 g)', 200]], 'cumin rice'],
  ['Lemon rice', 'grain', 'v', 155, 3, 28, 3.5, [['1 plate (200 g)', 200]], 'chitranna'],
  ['Curd rice', 'grain', 'v', 121, 3, 19, 3.7, [['1 bowl (200 g)', 200]], 'thayir sadam dahi'],
  ['Vegetable pulao', 'grain', 'v', 149, 3.3, 26, 3.5, [['1 plate (200 g)', 200]], 'pulav'],
  ['Vegetable biryani', 'grain', 'v', 161, 4, 24, 5.5, [['1 plate (250 g)', 250]], ''],
  ['Chicken biryani', 'grain', 'n', 172, 8.5, 21, 6, [['1 plate (300 g)', 300], ['1 katori (150 g)', 150]], 'murgh'],
  ['Dal khichdi', 'grain', 'v', 117, 4.5, 19, 2.5, [['1 bowl (250 g)', 250]], 'moong khichri'],
  ['Quinoa (cooked)', 'grain', 'v', 120, 4.4, 21, 1.9, [['1 katori (150 g)', 150]], ''],

  // Dal and curry
  ['Dal tadka (toor)', 'curry', 'v', 109, 5.5, 14.5, 3.2, [['1 katori (150 g)', 150], ['1 bowl (250 g)', 250]], 'arhar tur lentil'],
  ['Dal fry (restaurant style)', 'curry', 'v', 133, 6, 15, 5.5, [['1 katori (150 g)', 150]], ''],
  ['Moong dal (yellow)', 'curry', 'v', 106, 7, 15, 2, [['1 katori (150 g)', 150]], 'mung'],
  ['Masoor dal', 'curry', 'v', 110, 7, 16, 2, [['1 katori (150 g)', 150]], 'red lentil'],
  ['Chana dal', 'curry', 'v', 130, 8, 19, 2.5, [['1 katori (150 g)', 150]], 'bengal gram'],
  ['Dal makhani', 'curry', 'v', 152, 6, 14, 8, [['1 katori (150 g)', 150]], 'black lentil'],
  ['Rajma curry', 'curry', 'v', 120, 6, 15, 4, [['1 katori (150 g)', 150]], 'kidney beans'],
  ['Chole (chana masala)', 'curry', 'v', 158, 7, 19, 6, [['1 katori (150 g)', 150]], 'chickpea'],
  ['Sambar', 'curry', 'v', 55, 2.5, 8, 1.5, [['1 katori (150 g)', 150], ['1 bowl (250 g)', 250]], ''],
  ['Rasam', 'curry', 'v', 25, 1, 4, 0.7, [['1 katori (150 g)', 150]], ''],
  ['Kadhi', 'curry', 'v', 89, 3.2, 9, 4.5, [['1 katori (150 g)', 150]], 'gujarati punjabi'],
  ['Aloo sabzi (dry)', 'curry', 'v', 121, 2, 16, 5.5, [['1 katori (120 g)', 120]], 'potato'],
  ['Aloo gobi', 'curry', 'v', 86, 2.3, 9.5, 4.3, [['1 katori (150 g)', 150]], 'cauliflower'],
  ['Bhindi masala', 'curry', 'v', 100, 2.5, 8, 6.5, [['1 katori (120 g)', 120]], 'okra ladyfinger'],
  ['Baingan bharta', 'curry', 'v', 94, 2, 8, 6, [['1 katori (150 g)', 150]], 'brinjal eggplant'],
  ['Mixed vegetable curry', 'curry', 'v', 91, 2.5, 9, 5, [['1 katori (150 g)', 150]], 'sabzi'],
  ['Palak paneer', 'curry', 'v', 138, 7, 5, 10, [['1 katori (150 g)', 150]], 'spinach cottage cheese'],
  ['Paneer butter masala', 'curry', 'v', 188, 7.5, 8, 14, [['1 katori (150 g)', 150]], 'makhani'],
  ['Matar paneer', 'curry', 'v', 167, 8, 8, 11.5, [['1 katori (150 g)', 150]], 'peas'],
  ['Paneer bhurji', 'curry', 'v', 220, 14, 5, 16, [['1 katori (100 g)', 100]], 'scrambled'],
  ['Egg curry', 'curry', 'e', 129, 8, 4, 9, [['1 egg with gravy (120 g)', 120], ['2 eggs with gravy (240 g)', 240]], 'anda'],
  ['Chicken curry (boneless)', 'curry', 'n', 144, 13, 4, 8.5, [['1 katori (150 g)', 150]], 'murgh'],
  ['Butter chicken', 'curry', 'n', 171, 12, 6, 11, [['1 katori (150 g)', 150]], 'murgh makhani'],
  ['Mutton curry', 'curry', 'n', 185, 15, 4, 12, [['1 katori (150 g)', 150]], 'goat lamb gosht'],
  ['Fish curry', 'curry', 'n', 110, 12, 3, 5.5, [['1 katori (150 g)', 150]], 'machli rohu'],

  // Protein
  ['Egg, boiled', 'protein', 'e', 155, 12.6, 1.1, 10.6, [['1 large egg (50 g)', 50]], 'anda'],
  ['Egg white', 'protein', 'e', 52, 11, 0.7, 0.2, [['1 egg white (33 g)', 33]], 'anda safed'],
  ['Egg omelette (with oil)', 'protein', 'e', 185, 11, 1.5, 15, [['1 egg omelette (60 g)', 60], ['2 egg omelette (120 g)', 120]], 'anda'],
  ['Egg bhurji', 'protein', 'e', 173, 11, 3, 13, [['2 egg bhurji (150 g)', 150]], 'scrambled anda'],
  ['Chicken breast (cooked)', 'protein', 'n', 165, 31, 0, 3.6, [['1 piece (120 g)', 120], ['100 g', 100]], 'grilled roasted'],
  ['Chicken breast (raw)', 'protein', 'n', 120, 22.5, 0, 2.6, [['100 g raw', 100], ['1 piece raw (150 g)', 150]], 'uncooked'],
  ['Tandoori chicken', 'protein', 'n', 152, 25, 3, 4.5, [['1 leg piece (150 g)', 150]], ''],
  ['Chicken tikka', 'protein', 'n', 149, 22, 4, 5, [['6 pieces (150 g)', 150]], ''],
  ['Fish, grilled or steamed', 'protein', 'n', 120, 22, 0, 3, [['1 fillet (120 g)', 120]], 'machli'],
  ['Prawns (cooked)', 'protein', 'n', 99, 24, 0.2, 0.3, [['1 serving (100 g)', 100]], 'shrimp jhinga'],
  ['Tuna in water (canned)', 'protein', 'n', 116, 26, 0, 0.8, [['1 small can (110 g drained)', 110]], ''],
  ['Paneer', 'protein', 'v', 293, 18, 3.4, 23, [['50 g', 50], ['100 g', 100], ['1 cube (25 g)', 25]], 'cottage cheese'],
  ['Paneer tikka', 'protein', 'v', 233, 14, 6, 17, [['1 serving (150 g)', 150]], ''],
  ['Tofu', 'protein', 'v', 80, 8, 1.9, 4.8, [['100 g', 100]], 'soya paneer'],
  ['Soya chunks (dry)', 'protein', 'v', 345, 52, 33, 0.5, [['1 serving (30 g dry)', 30], ['50 g dry', 50]], 'nutrela meal maker'],
  ['Sprouted moong (boiled)', 'protein', 'v', 108, 7, 19, 0.5, [['1 katori (100 g)', 100]], 'sprouts usal'],
  ['Whey protein', 'protein', 'v', 400, 80, 10, 5, [['1 scoop (30 g)', 30]], 'supplement powder shake'],
  ['Greek yogurt (plain)', 'protein', 'v', 73, 10, 3.9, 2, [['1 cup (170 g)', 170]], 'hung curd'],
  ['Sattu (flour)', 'protein', 'v', 398, 22, 64, 6, [['2 tbsp (30 g)', 30]], 'roasted gram flour'],
  ['Peanuts (roasted)', 'protein', 'v', 585, 26, 16, 50, [['1 handful (30 g)', 30], ['1 tbsp (10 g)', 10]], 'moongphali'],
  ['Peanut butter', 'protein', 'v', 588, 25, 20, 50, [['1 tbsp (16 g)', 16]], ''],
  ['Almonds', 'protein', 'v', 579, 21, 22, 50, [['5 almonds (6 g)', 6], ['10 almonds (12 g)', 12], ['1 handful (28 g)', 28]], 'badam'],
  ['Cashews', 'protein', 'v', 553, 18, 30, 44, [['5 cashews (8 g)', 8], ['1 handful (28 g)', 28]], 'kaju'],
  ['Walnuts', 'protein', 'v', 654, 15, 14, 65, [['2 halves (7 g)', 7], ['1 handful (28 g)', 28]], 'akhrot'],

  // Snacks
  ['Samosa', 'snack', 'v', 301, 5, 31, 17.5, [['1 samosa (75 g)', 75]], 'aloo'],
  ['Kachori', 'snack', 'v', 350, 7, 38, 19, [['1 kachori (60 g)', 60]], ''],
  ['Onion pakora / bhajiya', 'snack', 'v', 302, 7, 28, 18, [['1 piece (20 g)', 20], ['1 plate (100 g)', 100]], 'bhaji fritters'],
  ['Vada pav', 'snack', 'v', 236, 5.5, 31, 10, [['1 vada pav (120 g)', 120]], 'mumbai'],
  ['Pav bhaji (bhaji only)', 'snack', 'v', 109, 3, 13, 5, [['1 plate (200 g)', 200]], 'bhaji'],
  ['Pani puri', 'snack', 'v', 143, 2.5, 22, 5, [['6 puris (120 g)', 120], ['1 puri (20 g)', 20]], 'golgappa puchka'],
  ['Bhel puri', 'snack', 'v', 166, 3.5, 28, 4.5, [['1 plate (150 g)', 150]], 'chaat'],
  ['Veg momos (steamed)', 'snack', 'v', 151, 5, 26, 3, [['6 pieces (150 g)', 150], ['1 piece (25 g)', 25]], 'dumplings'],
  ['Chicken momos (steamed)', 'snack', 'n', 175, 9, 22, 5, [['6 pieces (150 g)', 150], ['1 piece (25 g)', 25]], 'dumplings'],
  ['Pizza slice (veg)', 'snack', 'v', 266, 11, 33, 10, [['1 slice (110 g)', 110]], ''],
  ['French fries', 'snack', 'v', 313, 3.4, 41, 15, [['1 medium serving (115 g)', 115]], 'chips'],
  ['Potato chips', 'snack', 'v', 538, 6, 52, 34, [['1 small pack (28 g)', 28], ['1 large pack (52 g)', 52]], 'lays crisps'],
  ['Roasted chana', 'snack', 'v', 364, 19, 58, 5, [['1 handful (30 g)', 30]], 'bhuna'],
  ['Makhana (roasted)', 'snack', 'v', 347, 9.7, 77, 0.1, [['1 bowl (30 g)', 30]], 'fox nuts lotus seeds'],
  ['Marie biscuit', 'snack', 'v', 431, 7, 76, 11, [['1 biscuit (7 g)', 7], ['4 biscuits (28 g)', 28]], 'tea biscuit'],
  ['Parle-G biscuit', 'snack', 'v', 450, 7, 77, 13, [['1 biscuit (5 g)', 5], ['5 biscuits (25 g)', 25]], 'glucose'],
  ['Papad (roasted)', 'snack', 'v', 320, 20, 45, 3, [['1 papad (12 g)', 12]], 'papadum'],
  ['Milk chocolate', 'snack', 'v', 535, 7.6, 59, 30, [['1 small bar (25 g)', 25], ['2 squares (20 g)', 20]], 'dairy milk'],

  // Sweets
  ['Gulab jamun', 'sweet', 'v', 337, 5, 50, 13, [['1 piece (45 g)', 45]], ''],
  ['Jalebi', 'sweet', 'v', 389, 2.4, 70, 11, [['1 piece (35 g)', 35]], ''],
  ['Rasgulla', 'sweet', 'v', 184, 4.5, 38, 1.5, [['1 piece (45 g)', 45]], 'rosogolla'],
  ['Kheer', 'sweet', 'v', 149, 4, 22, 5, [['1 katori (150 g)', 150]], 'payasam rice pudding'],
  ['Suji halwa', 'sweet', 'v', 325, 4, 48, 13, [['1 katori (100 g)', 100]], 'sheera'],
  ['Besan ladoo', 'sweet', 'v', 457, 8, 50, 25, [['1 ladoo (40 g)', 40]], 'laddu'],
  ['Ice cream (vanilla)', 'sweet', 'v', 209, 3.5, 24, 11, [['1 scoop (60 g)', 60], ['1 cup (100 g)', 100]], ''],
  ['Sugar', 'sweet', 'v', 387, 0, 100, 0, [['1 tsp (4 g)', 4], ['1 tbsp (12 g)', 12]], 'chini'],
  ['Honey', 'sweet', 'v', 304, 0.3, 82, 0, [['1 tsp (7 g)', 7], ['1 tbsp (21 g)', 21]], 'shahad'],
  ['Jaggery', 'sweet', 'v', 383, 0.4, 98, 0.1, [['1 small piece (10 g)', 10]], 'gur'],

  // Fruit and veg
  ['Banana', 'fruit', 'v', 89, 1.1, 23, 0.3, [['1 medium (100 g)', 100], ['1 small (70 g)', 70]], 'kela'],
  ['Apple', 'fruit', 'v', 52, 0.3, 14, 0.2, [['1 medium (180 g)', 180]], 'seb'],
  ['Mango', 'fruit', 'v', 60, 0.8, 15, 0.4, [['1 cup slices (165 g)', 165], ['1 medium (200 g flesh)', 200]], 'aam'],
  ['Orange', 'fruit', 'v', 47, 0.9, 12, 0.1, [['1 medium (130 g)', 130]], 'santra'],
  ['Papaya', 'fruit', 'v', 43, 0.5, 11, 0.3, [['1 katori (150 g)', 150]], 'papita'],
  ['Watermelon', 'fruit', 'v', 30, 0.6, 7.6, 0.2, [['1 bowl (200 g)', 200]], 'tarbooz'],
  ['Grapes', 'fruit', 'v', 69, 0.7, 18, 0.2, [['1 katori (100 g)', 100]], 'angoor'],
  ['Guava', 'fruit', 'v', 68, 2.6, 14, 1, [['1 medium (100 g)', 100]], 'amrood'],
  ['Pomegranate', 'fruit', 'v', 83, 1.7, 19, 1.2, [['1 katori (100 g)', 100]], 'anar'],
  ['Dates (khajoor)', 'fruit', 'v', 277, 1.8, 75, 0.2, [['1 date (8 g)', 8], ['3 dates (24 g)', 24]], 'khajur'],
  ['Raisins', 'fruit', 'v', 299, 3, 79, 0.5, [['1 tbsp (10 g)', 10]], 'kishmish'],
  ['Cucumber', 'fruit', 'v', 15, 0.7, 3.6, 0.1, [['1 medium (150 g)', 150]], 'kakdi kheera'],
  ['Tomato', 'fruit', 'v', 18, 0.9, 3.9, 0.2, [['1 medium (100 g)', 100]], 'tamatar'],
  ['Carrot', 'fruit', 'v', 41, 0.9, 9.6, 0.2, [['1 medium (70 g)', 70]], 'gajar'],
  ['Onion', 'fruit', 'v', 40, 1.1, 9.3, 0.1, [['1 medium (100 g)', 100]], 'pyaz'],
  ['Salad (mixed, no dressing)', 'fruit', 'v', 20, 1, 4, 0.2, [['1 plate (150 g)', 150]], 'kachumber'],
  ['Potato (boiled)', 'fruit', 'v', 87, 1.9, 20, 0.1, [['1 medium (150 g)', 150]], 'aloo'],
  ['Sweet potato (boiled)', 'fruit', 'v', 76, 1.4, 18, 0.1, [['1 medium (130 g)', 130]], 'shakarkandi'],
  ['Green peas (boiled)', 'fruit', 'v', 84, 5.4, 15, 0.2, [['1 katori (100 g)', 100]], 'matar'],

  // Dairy and drinks
  ['Milk, toned (3% fat)', 'drink', 'v', 58, 3.1, 4.7, 3, [['1 glass (250 ml)', 250], ['1 cup (150 ml)', 150]], 'doodh'],
  ['Milk, full cream (6% fat)', 'drink', 'v', 87, 3.5, 4.9, 6, [['1 glass (250 ml)', 250], ['1 cup (150 ml)', 150]], 'doodh gold'],
  ['Milk, double toned (1.5% fat)', 'drink', 'v', 45, 3.3, 4.7, 1.5, [['1 glass (250 ml)', 250]], 'doodh'],
  ['Curd (dahi)', 'drink', 'v', 65, 3.5, 4.7, 3.5, [['1 katori (100 g)', 100], ['1 bowl (200 g)', 200]], 'yogurt'],
  ['Buttermilk (chaas)', 'drink', 'v', 23, 1, 3, 0.8, [['1 glass (250 ml)', 250]], 'mattha chhaas'],
  ['Lassi (sweet)', 'drink', 'v', 90, 3, 15, 2, [['1 glass (250 ml)', 250]], ''],
  ['Cheese slice', 'drink', 'v', 299, 19, 4, 23, [['1 slice (20 g)', 20]], 'amul processed'],
  ['Ghee', 'drink', 'v', 900, 0, 0, 100, [['1 tsp (5 g)', 5], ['1 tbsp (15 g)', 15]], 'clarified butter'],
  ['Butter', 'drink', 'v', 717, 0.9, 0.1, 81, [['1 tsp (5 g)', 5], ['1 tbsp (14 g)', 14]], 'makhan amul'],
  ['Cooking oil', 'drink', 'v', 900, 0, 0, 100, [['1 tsp (5 g)', 5], ['1 tbsp (15 g)', 15]], 'tel'],
  ['Mayonnaise', 'drink', 'e', 680, 1, 3, 75, [['1 tbsp (15 g)', 15]], ''],
  ['Chai with milk and sugar', 'drink', 'v', 56, 1.5, 7.5, 2.2, [['1 cup (150 ml)', 150], ['1 cutting chai (90 ml)', 90]], 'tea'],
  ['Chai with milk, no sugar', 'drink', 'v', 35, 1.8, 2.8, 1.8, [['1 cup (150 ml)', 150]], 'tea unsweetened'],
  ['Coffee with milk and sugar', 'drink', 'v', 50, 1.4, 7, 1.8, [['1 cup (150 ml)', 150]], ''],
  ['Black coffee', 'drink', 'v', 2, 0.1, 0, 0, [['1 cup (150 ml)', 150]], ''],
  ['Coconut water', 'drink', 'v', 19, 0.7, 3.7, 0.2, [['1 glass (250 ml)', 250]], 'nariyal pani'],
  ['Sugarcane juice', 'drink', 'v', 72, 0.2, 18, 0.3, [['1 glass (250 ml)', 250]], 'ganne ka ras'],
  ['Orange juice (packaged)', 'drink', 'v', 45, 0.7, 10.4, 0.2, [['1 glass (200 ml)', 200]], 'fruit juice'],
  ['Cola soft drink', 'drink', 'v', 42, 0, 10.6, 0, [['1 can (330 ml)', 330], ['1 bottle (600 ml)', 600]], 'coke pepsi thums up'],
  ['Beer (5%)', 'drink', 'v', 43, 0.5, 3.6, 0, [['1 bottle (650 ml)', 650], ['1 pint (330 ml)', 330]], 'alcohol'],
  ['Whisky', 'drink', 'v', 250, 0, 0, 0, [['1 peg (30 ml)', 30], ['1 large peg (60 ml)', 60]], 'alcohol rum vodka']
];

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const FOODS = RAW.map((r) => ({
  id: 'in:' + slug(r[0]),
  src: 'in',
  name: r[0],
  cat: r[1],
  diet: r[2],
  per100: { k: r[3], p: r[4], c: r[5], f: r[6] },
  portions: r[7].map(([l, g]) => ({ l, g })),
  alias: r[8] || ''
}));

export function matches(food, q) {
  const hay = (food.name + ' ' + (food.alias || '')).toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export function dietAllows(diet, foodDiet) {
  if (diet === 'veg') return foodDiet === 'v';
  if (diet === 'egg') return foodDiet !== 'n';
  return true;
}
