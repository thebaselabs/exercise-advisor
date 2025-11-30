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
      return JSON.parse(jsonMatch[0]);
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
    }
  } catch (error) {
    console.error('AI exercise planning failed:', error);
  }

  return getFallbackExercisePlan(totalCalories, userProfile);
}

// Emoji backup system
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
  
  // Personalize based on user profile
  const isSenior = userProfile.age > 65;
  const isBeginner = userProfile.activity === 'sedentary';
  const isAthlete = userProfile.activity === 'athlete';
  const isOverweight = userProfile.weight > 90;
  const isYoung = userProfile.age < 25;

  return {
    home: [
      {
        name: isSenior ? "Chair Yoga" : isBeginner ? "Beginner Bodyweight" : "HIIT Circuit",
        emoji: isSenior ? "🧘" : isBeginner ? "🌟" : "💥",
        duration: `${isSenior ? baseTime + 15 : baseTime} minutes`,
        calories: Math.round(totalCalories * (isSenior ? 0.6 : isBeginner ? 0.7 : 0.9)),
        instructions: isSenior ? "Seated poses, gentle stretches, focus on breathing" : 
                      isBeginner ? "3 sets of 10 reps. Squats, modified push-ups, planks" :
                      "20s work, 10s rest. Jumping jacks, squats, push-ups, planks",
        difficulty: isSenior ? "Beginner" : isBeginner ? "Beginner" : "Intermediate",
        needsEstimate: true
      },
      {
        name: isSenior ? "Seated Strength" : isOverweight ? "Low-Impact Cardio" : "Jump Rope Intervals",
        emoji: isSenior ? "💺" : isOverweight ? "🚶" : "🏃",
        duration: `${isSenior ? baseTime + 10 : baseTime - 5} minutes`,
        calories: Math.round(totalCalories * (isSenior ? 0.5 : isOverweight ? 0.6 : 0.95)),
        instructions: isSenior ? "Seated leg lifts, arm circles, light resistance bands" :
                      isOverweight ? "Marching in place, step touches, gentle movements" :
                      "3 min jumping, 1 min rest. Alternate basic jumps and high knees",
        difficulty: isSenior ? "Beginner" : isOverweight ? "Beginner" : "Intermediate",
        needsEstimate: true
      },
      {
        name: isAthlete ? "Advanced Calisthenics" : "Yoga Flow",
        emoji: isAthlete ? "🏋️" : "🧘",
        duration: `${isAthlete ? baseTime - 10 : baseTime + 10} minutes`,
        calories: Math.round(totalCalories * (isAthlete ? 1.1 : 0.7)),
        instructions: isAthlete ? "Muscle-ups, handstand push-ups, advanced core work" :
                      "Sun salutations, holding poses 30-60s, focus on breath & form",
        difficulty: isAthlete ? "Advanced" : "Beginner",
        needsEstimate: isAthlete
      }
    ],
    outdoor: [
      {
        name: isSenior ? "Brisk Walking" : isYoung ? "Running Intervals" : "Running",
        emoji: isSenior ? "🚶" : "🏃‍♂️",
        duration: `${isSenior ? baseTime + 20 : baseTime - 5} minutes`,
        calories: Math.round(totalCalories * (isSenior ? 0.7 : 1.0)),
        instructions: isSenior ? "Comfortable pace walking, focus on posture and breathing" :
                      isYoung ? "1 min sprint, 2 min jog repeats for entire duration" :
                      "5 min warm-up, 30 min steady pace, 5 min cool-down",
        difficulty: isSenior ? "Beginner" : isYoung ? "Intermediate" : "Beginner",
        needsEstimate: false
      },
      {
        name: isOverweight ? "Swimming" : "Cycling",
        emoji: isOverweight ? "🏊" : "🚴",
        duration: `${isOverweight ? baseTime : baseTime + 15} minutes`,
        calories: Math.round(totalCalories * (isOverweight ? 0.85 : 0.9)),
        instructions: isOverweight ? "Freestyle laps, focus on technique, low impact" :
                      "Moderate pace cycling. Include some hills for intensity variation",
        difficulty: "Beginner",
        needsEstimate: isOverweight
      },
      {
        name: isBeginner ? "Nature Walk" : "Hill Sprints",
        emoji: isBeginner ? "🌳" : "⛰️",
        duration: `${isBeginner ? baseTime + 25 : baseTime - 15} minutes`,
        calories: Math.round(totalCalories * (isBeginner ? 0.5 : 1.2)),
        instructions: isBeginner ? "Leisurely walking, enjoy surroundings, gentle pace" :
                      "Find a hill: sprint up, walk down. Repeat for duration",
        difficulty: isBeginner ? "Beginner" : "Advanced",
        needsEstimate: true
      }
    ],
    gym: [
      {
        name: isSenior ? "Recumbent Bike" : "Stair Climber",
        emoji: isSenior ? "🚲" : "🪜",
        duration: `${isSenior ? baseTime + 10 : baseTime - 10} minutes`,
        calories: Math.round(totalCalories * (isSenior ? 0.6 : 1.1)),
        instructions: isSenior ? "Seated cycling, comfortable resistance, focus on endurance" :
                      "Steady pace on stair machine. Use intervals: 3 min hard, 2 min moderate",
        difficulty: "Beginner",
        needsEstimate: false
      },
      {
        name: isAthlete ? "CrossFit Circuit" : "Full Body Weights",
        emoji: isAthlete ? "🔥" : "🏋️",
        duration: `${isAthlete ? baseTime - 5 : baseTime + 5} minutes`,
        calories: Math.round(totalCalories * (isAthlete ? 1.0 : 0.6)),
        instructions: isAthlete ? "AMRAP: burpees, box jumps, kettlebell swings, pull-ups" :
                      "3 sets of 10 reps. Squats, bench press, rows, shoulder press. 60s rest between sets",
        difficulty: isAthlete ? "Advanced" : "Intermediate",
        needsEstimate: true
      },
      {
        name: userProfile.gender === 'female' ? "Bone Strength Training" : "Rowing Machine",
        emoji: userProfile.gender === 'female' ? "🦴" : "🚣",
        duration: `${baseTime} minutes`,
        calories: Math.round(totalCalories * 0.95),
        instructions: userProfile.gender === 'female' ? "Weight-bearing exercises: squats, lunges, shoulder press for bone density" :
                      "20 min steady rowing, 10 min intervals. Focus on full-body form",
        difficulty: "Beginner",
        needsEstimate: false
      }
    ]
  };
}
