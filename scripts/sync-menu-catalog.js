const { Client } = require("pg");

const lunchDinnerItems = [
  { name: "Chicken Curry", price: 450, category: "Filipino Food", type: "single" },
  { name: "Caramelized Chicken", price: 420, category: "Filipino Food", type: "single" },
  { name: "Dory en Blanc", price: 400, category: "Filipino Food", type: "single" },
  { name: "Beef Jalapeno", price: 480, category: "Filipino Food", type: "single" },
  { name: "Chicken Tomato Stew", price: 450, category: "Filipino Food", type: "single" },
  { name: "Chicken Royal", price: 480, category: "Filipino Food", type: "single" },
  { name: "Sweet & Sour Chicken", price: 450, category: "Filipino Food", type: "single" },
  { name: "Chicken Schnitzel", price: 450, category: "Filipino Food", type: "single" },
  { name: "Chop Suey", price: 420, category: "Filipino Food", type: "single" },
  { name: "Chicken Garlic Mushroom", price: 450, category: "Filipino Food", type: "single" },
  { name: "Shrimp Tempura", price: 480, category: "Filipino Food", type: "single" },
  { name: "Pork Hamonado", price: 480, category: "Filipino Food", type: "single" },
  { name: "Beef Bulalo", price: 520, category: "Filipino Food", type: "single" },
  { name: "Shrimp Sinigang", price: 480, category: "Filipino Food", type: "single" },
  { name: "Rice Platter", price: 150, category: "Rice", type: "single" },
  { name: "Plain Rice", price: 25, category: "Rice", type: "single" },
  { name: "Garlic Rice", price: 35, category: "Rice", type: "single" },

  { name: "Garlic Shrimp Pasta", price: 420, category: "Pasta", type: "single" },
  { name: "Chicken Alfredo Pasta", price: 420, category: "Pasta", type: "single" },
  { name: "Calamari Pasta", price: 420, category: "Pasta", type: "single" },
  { name: "Tuna Pesto Pasta", price: 450, category: "Pasta", type: "single" },
  { name: "Carbonara", price: 420, category: "Pasta", type: "single" },
  { name: "Classic Spaghetti", price: 480, category: "Pasta", type: "single" },

  { name: "Hotdog Sandwich", price: 280, category: "Sandwiches", type: "single" },
  { name: "Club Sandwich", price: 380, category: "Sandwiches", type: "single" },
  { name: "Bruschetta", price: 320, category: "Sandwiches", type: "single" },
  { name: "Dejavu Hamburger", price: 380, category: "Sandwiches", type: "single" },

  { name: "Lumpia", price: 420, category: "Appetizer", type: "single" },
  { name: "Calamares", price: 320, category: "Appetizer", type: "single" },
  { name: "Chinese Smashed Cucumber", price: 280, category: "Appetizer", type: "single" },
  { name: "Mouth Watering Chicken", price: 400, category: "Appetizer", type: "single" },
  { name: "Deviled Egg", price: 280, category: "Appetizer", type: "single" },
  { name: "Marinated Peanuts", price: 290, category: "Appetizer", type: "single" },
  { name: "Sweet Dressed Tomatoes", price: 280, category: "Appetizer", type: "single" },
  { name: "French Fries", price: 150, category: "Appetizer", type: "single" },

  { name: "Hot Pot Soup Base", price: 480, category: "Hotpot", type: "single" },
  { name: "Beef Roll", price: 450, category: "Hotpot", type: "single" },
  { name: "Seafood Tofu", price: 360, category: "Hotpot", type: "single" },
  { name: "Sausage (Hotpot)", price: 320, category: "Hotpot", type: "single" },
  { name: "Dipping Sauce", price: 50, category: "Hotpot", type: "single" },
  { name: "Beef Tongue", price: 390, category: "Sunset BBQ", type: "single" },
  { name: "Lobster Roll", price: 360, category: "Sunset BBQ", type: "single" },
  { name: "Chikuwa", price: 360, category: "Sunset BBQ", type: "single" },
  { name: "Squid Roll", price: 220, category: "Sunset BBQ", type: "single" },
  { name: "Radish", price: 120, category: "Sunset BBQ", type: "single" },
  { name: "Luncheon Meat", price: 400, category: "Sunset BBQ", type: "single" },
  { name: "Vermicelli", price: 280, category: "Sunset BBQ", type: "single" },
  { name: "Potato", price: 150, category: "Sunset BBQ", type: "single" },
  { name: "Shrimp (Hotpot)", price: 450, category: "Sunset BBQ", type: "single" },
  { name: "Beef Skewer", price: 80, category: "Sunset BBQ", type: "single" },
  { name: "Cheese Fish Tofu", price: 80, category: "Sunset BBQ", type: "single" },
  { name: "Sausage (BBQ)", price: 60, category: "Sunset BBQ", type: "single" },
  { name: "Chicken Thigh", price: 350, category: "Sunset BBQ", type: "single" },
  { name: "Fish Ball", price: 60, category: "Sunset BBQ", type: "single" },
  { name: "Shrimp (BBQ)", price: 200, category: "Sunset BBQ", type: "single" },
  { name: "Eggplant", price: 50, category: "Sunset BBQ", type: "single" },
  { name: "Potato Slice", price: 50, category: "Sunset BBQ", type: "single" },

  { name: "Steamed Fish", price: 1200, category: "Chinese Food", type: "single" },
  { name: "Hong Shao Yu", price: 1200, category: "Chinese Food", type: "single" },
  { name: "Mapo Tofu", price: 380, category: "Chinese Food", type: "single" },
  { name: "Stir-fried Pork with Chillies", price: 480, category: "Chinese Food", type: "single" },
  { name: "Suan Cai Yu", price: 1200, category: "Chinese Food", type: "single" },
  { name: "Braised Beef Brisket", price: 520, category: "Chinese Food", type: "single" },
  { name: "Sichuan Spicy Chicken Cubes", price: 420, category: "Chinese Food", type: "single" },
  { name: "Pan-fried Tofu", price: 370, category: "Chinese Food", type: "single" },
  { name: "Dumplings (8 pcs)", price: 300, category: "Chinese Food", type: "single" },
  { name: "Steamed Egg Soup", price: 90, category: "Chinese Food", type: "single" },
  { name: "Chinese Style Prawns", price: 420, category: "Chinese Food", type: "single" },
  { name: "Braised Chicken", price: 450, category: "Chinese Food", type: "single" },
  { name: "Braised Pork", price: 490, category: "Chinese Food", type: "single" },
  { name: "Chicken in Soy Bean Sauce", price: 420, category: "Chinese Food", type: "single" },
  { name: "Wok-seared Lettuce", price: 360, category: "Chinese Food", type: "single" },
  { name: "Morning Glory w/ Garlic", price: 280, category: "Chinese Food", type: "single" },
  { name: "Dry-fried Green Beans", price: 360, category: "Chinese Food", type: "single" },
  { name: "Stir-fried Cabbage w/ Chili", price: 290, category: "Chinese Food", type: "single" },
  { name: "Stir-fried Beef w/ Onion", price: 490, category: "Chinese Food", type: "single" },
  { name: "Stir-fried Eggs w/ Tomato Onion Cucumber", price: 300, category: "Chinese Food", type: "single" },
  { name: "Stir-fried Potatoes w/ Chili", price: 320, category: "Chinese Food", type: "single" },
  { name: "Braised Eggplant", price: 360, category: "Chinese Food", type: "single" },
  { name: "Peking Zha Jiang Noodle", price: 400, category: "Chinese Food", type: "single" },

  { name: "Grouper", price: 120, category: "Local Catch", type: "single" },
  { name: "Hairtail", price: 80, category: "Local Catch", type: "single" },
  { name: "Parrot Fish", price: 90, category: "Local Catch", type: "single" },
  { name: "Crab", price: 150, category: "Treasures from the Sea", type: "single" },
  { name: "Mantis", price: 360, category: "Treasures from the Sea", type: "single" },
  { name: "Tiger Prawn", price: 200, category: "Treasures from the Sea", type: "single" },

  { name: "San Mig Pilsen", price: 120, category: "Beer", type: "single" },
  { name: "San Mig Light", price: 120, category: "Beer", type: "single" },
  { name: "Stallion", price: 120, category: "Beer", type: "single" },
  { name: "Coke", price: 90, category: "Soft Drinks", type: "single" },
  { name: "Coke Zero", price: 90, category: "Soft Drinks", type: "single" },
  { name: "Sprite", price: 90, category: "Soft Drinks", type: "single" },
  { name: "Royal", price: 90, category: "Soft Drinks", type: "single" },
  { name: "Mango Juice", price: 90, category: "Canned Juices", type: "single" },
  { name: "Pineapple Juice", price: 90, category: "Canned Juices", type: "single" },
  { name: "Pineapple Orange Juice", price: 90, category: "Canned Juices", type: "single" },
  { name: "Four Seasons Juice", price: 90, category: "Canned Juices", type: "single" },
  { name: "Mango Shake", price: 150, category: "Shakes", type: "single" },
  { name: "Watermelon Shake", price: 150, category: "Shakes", type: "single" },
  { name: "Banana Shake", price: 150, category: "Shakes", type: "single" },
  { name: "Coke Zero (Vanilla)", price: 100, category: "Soft Drinks", type: "single" },
  { name: "Coke (Jack Daniels)", price: 200, category: "Special Drinks", type: "single" },
  { name: "Grande (San Mig)", price: 180, category: "Beer", type: "single" },
  { name: "Red Horse (Liter)", price: 180, category: "Beer", type: "single" },
  { name: "Black Coffee", price: 100, category: "Coffee", type: "single" },
  { name: "Espresso", price: 100, category: "Coffee", type: "single" },
  { name: "Latte", price: 150, category: "Coffee", type: "single" },
  { name: "Americano", price: 120, category: "Coffee", type: "single" }
];

const cocktailItems = [
  { name: "Long Island Iced Tea", price: 240, category: "Classic Cocktails", type: "single" },
  { name: "Cuba Libre", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Gin & Tonic", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Caipirinha", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Mojito", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Margarita", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Pina Colada", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Sex on the Beach", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Mai Tai", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Rhum Coke", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Mango Daiquiri", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Amaretto Sour", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Screwdriver", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Sidecar", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Blue Lagoon", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Tequila Sunrise", price: 180, category: "Classic Cocktails", type: "single" },
  { name: "Aperol Spritz", price: 350, category: "Classic Cocktails", type: "single" },
  { name: "Whiskey Sour", price: 200, category: "Classic Cocktails", type: "single" },

  { name: "Manila Dawn", price: 480, category: "Galleon Echoes", type: "single" },
  { name: "Spice Voyage", price: 480, category: "Galleon Echoes", type: "single" },
  { name: "Pacific Crossing", price: 480, category: "Galleon Echoes", type: "single" },
  { name: "Acapulco Sunset", price: 480, category: "Galleon Echoes", type: "single" },
  { name: "Sugarlandia (Don Papa Signature)", price: 520, category: "Galleon Echoes", type: "single" },
  { name: "Flan de Cebu", price: 480, category: "Galleon Echoes", type: "single" },
  { name: "Silent Passage (Mocktail)", price: 420, category: "Galleon Echoes", type: "single" },

  { name: "Coral Bay Moon", price: 480, category: "Island Reverie", type: "single" },
  { name: "Balete Whisper", price: 480, category: "Island Reverie", type: "single" },
  { name: "White Sands", price: 480, category: "Island Reverie", type: "single" },
  { name: "The Healer's Remedy", price: 480, category: "Island Reverie", type: "single" },
  { name: "Crimson Enchanter (Don Papa Signature)", price: 520, category: "Island Reverie", type: "single" },
  { name: "Mango Sticky Rice", price: 480, category: "Island Reverie", type: "single" },
  { name: "Starlit Shores (Mocktail)", price: 420, category: "Island Reverie", type: "single" }
];

function rowsForInsert() {
  const rows = [];
  let sort = 1;

  for (const item of lunchDinnerItems) {
    rows.push({ ...item, menuGroup: "lunch_dinner", sortOrder: sort++ });
  }

  sort = 1;
  for (const item of cocktailItems) {
    rows.push({ ...item, menuGroup: "cocktail", sortOrder: sort++ });
  }

  return rows;
}

async function upsertItem(client, item) {
  const existing = await client.query(
    "SELECT id FROM menu_items WHERE name = $1 AND menu_group = $2 LIMIT 1",
    [item.name, item.menuGroup]
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE menu_items
       SET price = $2,
           category = $3,
           item_type = $4,
           sort_order = $5,
           is_active = true
       WHERE id = $1`,
      [existing.rows[0].id, item.price, item.category, item.type, item.sortOrder]
    );
    return "updated";
  }

  await client.query(
    `INSERT INTO menu_items (name, price, category, menu_group, item_type, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, true, $6)`,
    [item.name, item.price, item.category, item.menuGroup, item.type, item.sortOrder]
  );
  return "inserted";
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const rows = rowsForInsert();

  await client.connect();
  try {
    let inserted = 0;
    let updated = 0;
    for (const item of rows) {
      const action = await upsertItem(client, item);
      if (action === "inserted") inserted += 1;
      if (action === "updated") updated += 1;
    }

    const counts = await client.query(
      `SELECT menu_group, COUNT(*)::int AS count
       FROM menu_items
       WHERE is_active = true
       GROUP BY menu_group
       ORDER BY menu_group`
    );

    console.log(JSON.stringify({ inserted, updated, counts: counts.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
