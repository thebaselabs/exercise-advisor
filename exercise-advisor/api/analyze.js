// analyze.js - PURE AI VERSION (NO FALLBACKS)
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
    return JSON.parse(jsonMatch[0]);
  } else {
    throw new Error('AI returned invalid response format');
  }
}

async function generateExercisePlan(totalCalories, userProfile) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const prompt = `
  Create a TRULY personalized exercise plan for ${totalCalories} calories.

  USER PROFILE:
  - Age: ${userProfile.age} years
  - Weight: ${userProfile.weight} kg
  - Gender: ${userProfile.gender}
  - Activity Level: ${userProfile.activity}

  PERSONALIZATION RULES:
  AGE-BASED:
  - Under 18: Youth-friendly, skill-building exercises
  - 18-50: Full intensity range, all exercise types
  - 50-65: Moderate impact, joint-friendly options
  - Over 65: Low impact, balance-focused, seated options

  ACTIVITY LEVEL:
  - Sedentary: Beginner-friendly, low intensity, gradual progression
  - Light: Moderate intensity, mixed cardio/strength
  - Moderate: Balanced intensity, varied exercises
  - Active: High intensity, challenging workouts
  - Athlete: Advanced, elite-level exercises

  WEIGHT CONSIDERATIONS:
  - Under 60kg: Focus on endurance, bodyweight exercises
  - 60-90kg: Balanced strength and cardio
  - Over 90kg: Low-impact, joint-friendly, strength-focused

  GENDER-SPECIFIC:
  - Male: Typically higher muscle mass - include strength training
  - Female: Bone density focus - include weight-bearing exercises
  - Other: Balanced approach based on other factors

  For EACH of the 3 exercises in EACH category (home, outdoor, gym), include:
  - name: String
  - emoji: String (REQUIRED - ONE perfect emoji representing this exercise)
  - duration: String (realistic time to burn target calories)
  - calories: Number (accurate burn for this user profile)
  - instructions: String (brief how-to instructions)
  - difficulty: String
  - needsEstimate: Boolean

  Return JSON: { home: Array[3], outdoor: Array[3], gym: Array[3] }

  IMPORTANT: Exercises MUST vary significantly based on user profile. Never return the same plan for different users.`;

  const result = await model.generateContent(prompt);
  const text = await result.response.text();
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const exercisePlan = JSON.parse(jsonMatch[0]);
    return ensureEmojis(exercisePlan);
  } else {
    throw new Error('AI returned invalid exercise plan format');
  }
}

// Emoji backup system (only for emojis, not exercises)
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
