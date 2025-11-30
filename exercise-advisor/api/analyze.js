// analyze.js - IMPROVED VERSION WITH MULTI-STEP AI ANALYSIS
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, data, userProfile } = req.body;

    if (type === 'calories') {
      const result = await calculateCaloriesWithAI(data.foodName, data.quantity, data.unit);
      return res.status(200).json(result);
    } else if (type === 'exercise') {
      const result = await generateExercisePlan(data.totalCalories, userProfile);
      return res.status(200).json(result);
    } else {
      return res.status(400).json({ error: 'Invalid request type' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function calculateCaloriesWithAI(foodName, quantity, unit) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  try {
    // STEP 1: Food Identification & Analysis
    const analysisPrompt = `
    Analyze this food description: "${foodName}"
    
    Break it down into:
    1. MAIN_COMPONENTS: [list main ingredients]
    2. COOKING_METHOD: [fried, grilled, baked, raw, sautéed, etc.]
    3. ADDITIONS: [sauces, oils, dressings, creams, etc.]
    4. TYPICAL_PORTION: estimate weight/size for "${quantity} ${unit}"
    5. CALORIE_DENSITY: high/medium/low

    Consider spelling variations and regional names.
    Return as JSON.`;

    const analysisResult = await model.generateContent(analysisPrompt);
    const analysisText = await analysisResult.response.text();
    
    // STEP 2: Calorie Calculation with Context
    const calculationPrompt = `
    Based on this analysis: ${analysisText}
    
    Calculate accurate calories using:
    - USDA standard food database values
    - Cooking method adjustments:
      * Fried: +40-60%
      * Grilled/Baked: +10-20% 
      * Sautéed: +20-30%
      * With creamy sauce: +40%
      * With oil/butter: +100-150 cal per tbsp
    - Realistic portion sizes
    - Common preparation styles

    Return JSON: {"calories": number, "confidence": "high/medium/low"}
    
    Confidence levels:
    - "high": Basic foods (apple, banana, chicken breast) - 95%+ accurate
    - "medium": Common dishes with clear ingredients - 80% accurate  
    - "low": Complex/regional dishes - 60% accurate`;

    const calculationResult = await model.generateContent(calculationPrompt);
    const calculationText = await calculationResult.response.text();

    // Extract JSON from response
    const jsonMatch = calculationText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
    return ensureEmojis(JSON.parse(jsonMatch[0]));
    }
  } catch (error) {
    console.error('AI calculation failed:', error);
  }

  // Fallback: estimate based on food type
  const estimatedCalories = await getFallbackCalories(foodName, quantity, unit);
  return { calories: estimatedCalories, confidence: "low" };
}

async function generateExercisePlan(totalCalories, userProfile) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  try {
    const prompt = `
    Create a personalized exercise plan for ${totalCalories} calories.

    USER PROFILE:
    - Gender: ${userProfile.gender}
    - Age: ${userProfile.age}
    - Weight: ${userProfile.weight} kg  
    - Activity Level: ${userProfile.activity}

    Provide exactly 3 best exercises for EACH category:

    HOME (no equipment):
    - Most effective bodyweight exercises
    - Suitable for ${userProfile.activity} activity level
    - Time-efficient and practical

    OUTDOOR:
    - Best outdoor cardio options  
    - Consider ${userProfile.age} years old
    - Realistic for ${userProfile.weight} kg person

    GYM (equipment required):
    - Optimal gym machine exercises
    - Safe for user profile
    - Maximum calorie burn efficiency

    For each exercise include:
    - name: String
    - emoji: String (REQUIRED - ONE perfect emoji that visually represents this exercise. NEVER omit this field.)
    - duration: String (realistic time: 30-75 minutes)
    - calories: Number (realistic burn rate, NOT exactly ${totalCalories})
    - instructions: String (brief how-to, 2-3 lines)
    - difficulty: String
    - needsEstimate: Boolean (true for variable-intensity exercises)

    Return JSON: {
      home: Array[3],
      outdoor: Array[3], 
      gym: Array[3]
    }`;

    const result = await model.generateContent(prompt);
    const text = await result.response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('AI exercise planning failed:', error);
  }

  return getFallbackExercisePlan(totalCalories, userProfile);
}

// Fallback functions
async function getFallbackCalories(foodName, quantity, unit) {
  const commonFoods = {
    'apple': 95, 'banana': 105, 'orange': 62, 'chicken breast': 165,
    'egg': 78, 'bread': 79, 'milk': 149, 'rice': 130, 'pasta': 158,
    'potato': 130, 'carrot': 25, 'broccoli': 55, 'salmon': 208
  };

  const cleanName = foodName.toLowerCase().trim();
  for (const [food, calories] of Object.entries(commonFoods)) {
    if (cleanName.includes(food)) {
      return calories * quantity;
    }
  }
  
  // Default estimate based on unit
  const unitMultipliers = { 'g': 1, 'kg': 1000, 'cup': 200, 'bowl': 400, 'piece': 150, 'slice': 30, 'serving': 200 };
  const multiplier = unitMultipliers[unit] || 150;
  return 1.5 * multiplier * quantity;
}

function getFallbackExercisePlan(totalCalories, userProfile) {
  const baseTime = Math.max(30, Math.min(75, Math.round(totalCalories / 10)));
  
  return {
    home: [
      {
        name: "HIIT Circuit",
        duration: `${baseTime} minutes`,
        calories: Math.round(totalCalories * 0.9),
        instructions: "20s work, 10s rest. Jumping jacks, squats, push-ups, planks in circuit",
        difficulty: "Intermediate",
        needsEstimate: true
      },
      {
        name: "Bodyweight Strength",
        duration: `${baseTime + 10} minutes`,
        calories: Math.round(totalCalories * 0.7),
        instructions: "3 sets of 12 reps. Squats, lunges, push-ups, planks with 60s rest between sets",
        difficulty: "Beginner",
        needsEstimate: false
      },
      {
        name: "Jump Rope Intervals",
        duration: `${baseTime - 5} minutes`,
        calories: Math.round(totalCalories * 0.95),
        instructions: "3 min jumping, 1 min rest. Alternate basic jumps and high knees",
        difficulty: "Intermediate",
        needsEstimate: true
      }
    ],
    outdoor: [
      {
        name: "Running",
        duration: `${baseTime - 5} minutes`,
        calories: Math.round(totalCalories * 1.0),
        instructions: "5 min warm-up, 30 min steady pace, 5 min cool-down. Focus on breathing rhythm",
        difficulty: "Beginner",
        needsEstimate: false
      },
      {
        name: "Cycling",
        duration: `${baseTime + 15} minutes`,
        calories: Math.round(totalCalories * 0.9),
        instructions: "Moderate pace cycling. Include some hills for intensity variation",
        difficulty: "Beginner",
        needsEstimate: false
      },
      {
        name: "Swimming",
        duration: `${baseTime} minutes`,
        calories: Math.round(totalCalories * 0.85),
        instructions: "Freestyle laps. 4 laps hard, 2 laps easy. Focus on technique",
        difficulty: "Intermediate",
        needsEstimate: true
      }
    ],
    gym: [
      {
        name: "Stair Climber",
        duration: `${baseTime - 10} minutes`,
        calories: Math.round(totalCalories * 1.1),
        instructions: "Steady pace on stair machine. Use intervals: 3 min hard, 2 min moderate",
        difficulty: "Beginner",
        needsEstimate: false
      },
      {
        name: "Full Body Weights",
        duration: `${baseTime + 5} minutes`,
        calories: Math.round(totalCalories * 0.6),
        instructions: "3 sets of 10 reps. Squats, bench press, rows, shoulder press. 60s rest between sets",
        difficulty: "Intermediate",
        needsEstimate: true
      },
      {
        name: "Rowing Machine",
        duration: `${baseTime} minutes`,
        calories: Math.round(totalCalories * 0.95),
        instructions: "20 min steady rowing, 10 min intervals. Focus on full-body form",
        difficulty: "Beginner",
        needsEstimate: false
      }
    ]
  };
}
// ADD THIS AT THE VERY END OF THE FILE

function ensureEmojis(exercisePlan) {
    const defaultEmojis = { home: '💪', outdoor: '🏃‍♂️', gym: '🏋️' };
    
    ['home', 'outdoor', 'gym'].forEach(category => {
        if (exercisePlan[category]) {
            exercisePlan[category].forEach(exercise => {
                if (!exercise.emoji) {
                    exercise.emoji = defaultEmojis[category];
                }
            });
        }
    });
    return exercisePlan;
}


