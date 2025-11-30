import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, data, userProfile } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    let prompt = '';

    if (type === 'calories') {
      const { foodName, quantity, unit } = data;
      
      // MULTI-STEP AI ANALYSIS with CONFIDENCE SCORING
      prompt = `Analyze this food and calculate calories with accuracy assessment:

FOOD: "${foodName}"
QUANTITY: ${quantity} ${unit}

STEP 1 - FOOD ANALYSIS:
- Identify main ingredients
- Detect cooking method (fried, grilled, baked, raw, etc.)
- Note any sauces, oils, or additions
- Estimate portion size/weight

STEP 2 - CALORIE CALCULATION:
- Use USDA standard food database values
- Apply cooking method adjustments
- Consider portion size realism
- Use MET values where applicable

STEP 3 - CONFIDENCE ASSESSMENT:
- "high": Basic single foods (apple, chicken breast) - 95%+ accurate
- "medium": Common dishes with clear ingredients - 80% accurate
- "low": Complex/regional dishes - 60% accurate

Return ONLY valid JSON:
{
  "calories": number,
  "confidence": "high/medium/low",
  "details": "brief explanation"
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI returned invalid response format');
      }

      const calorieData = JSON.parse(jsonMatch[0]);
      return res.json(calorieData);

    } else if (type === 'exercise') {
      const { totalCalories } = data;
      
      // PERSONALIZED EXERCISE PLANNING with SMART FILTERING
      const intensityMap = {
        'sedentary': {
          intensity: 'LOW',
          duration: '25-30 minutes',
          exercises: 'walking, light aerobics, gentle yoga, stretching, chair exercises',
          description: 'Very gentle, beginner-friendly exercises'
        },
        'light': {
          intensity: 'LOW-MODERATE', 
          duration: '24-28 minutes',
          exercises: 'brisk walking, light circuits, beginner intervals',
          description: 'Gentle exercises with slightly increased intensity'
        },
        'moderate': {
          intensity: 'MODERATE',
          duration: '22-26 minutes',
          exercises: 'HIIT, circuit training, jogging intervals, power yoga',
          description: 'Moderate intensity with good variety'
        },
        'active': {
          intensity: 'MODERATE-HIGH',
          duration: '20-24 minutes',
          exercises: 'running intervals, advanced circuits, sports drills',
          description: 'Challenging workouts for active individuals'
        },
        'athlete': {
          intensity: 'HIGH',
          duration: '18-22 minutes',
          exercises: 'sprint intervals, plyometrics, advanced calisthenics',
          description: 'High-intensity professional level exercises'
        }
      };

      const userIntensity = intensityMap[userProfile.activity.toLowerCase()] || intensityMap.moderate;

      // REALISTIC CALORIE CALCULATIONS using MET values
      prompt = `Create PERSONALIZED exercise plans using MET values and user profile.

USER PROFILE FOR PERSONALIZATION:
- Age: ${userProfile.age} years (${userProfile.age < 30 ? "young" : userProfile.age > 50 ? "senior" : "adult"})
- Weight: ${userProfile.weight} kg (${userProfile.weight > 90 ? "heavy" : userProfile.weight < 60 ? "light" : "average"})
- Gender: ${userProfile.gender}
- Activity: ${userProfile.activity} (${userIntensity.description})

PERSONALIZATION RULES:
- Age-based: ${userProfile.age < 18 ? "youth-friendly" : userProfile.age > 65 ? "senior-safe" : "all-levels"}
- Weight-based: ${userProfile.weight > 90 ? "low-impact" : "standard-intensity"}
- Activity-based: ${userIntensity.intensity} intensity

MET-BASED CALORIE CALCULATIONS:
- Target: ${Math.round(totalCalories)} calories
- User weight: ${userProfile.weight}kg
- Use realistic MET values for each exercise type
- Adjust for user's ${userIntensity.intensity} intensity level

EXERCISE REQUIREMENTS with SMART FILTERING:
- Provide 3 BEST exercises per category (Home, Outdoor, Gym)
- SMART FILTER: Remove exercises unsuitable for user profile
- Each exercise burns ~${Math.round(totalCalories)} calories
- Duration: ${userIntensity.duration} maximum
- Include age-appropriate, weight-appropriate exercises

Return valid JSON: { 
  "home": Array[3], 
  "outdoor": Array[3], 
  "gym": Array[3] 
}

Each exercise: { 
  "name": "string", 
  "duration": "string", 
  "calories": number, 
  "instructions": "string", 
  "difficulty": "string" 
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI returned invalid exercise plan format');
      }

      const exercisePlan = JSON.parse(jsonMatch[0]);
      
      // SMART FILTERING: Ensure exercises are appropriate
      const filteredPlan = filterExercisesByProfile(exercisePlan, userProfile);
      return res.json(filteredPlan);

    } else {
      return res.status(400).json({ error: 'Invalid request type' });
    }

  } catch (error) {
    console.error('API Error:', error);
    throw error; // Let the error propagate - NO FALLBACKS
  }
}

// SMART FILTERING of exercise recommendations (NO FALLBACKS)
function filterExercisesByProfile(exercisePlan, userProfile) {
  const filteredPlan = { home: [], outdoor: [], gym: [] };
  
  ['home', 'outdoor', 'gym'].forEach(category => {
    if (exercisePlan[category]) {
      exercisePlan[category].forEach(exercise => {
        // Filter out exercises unsuitable for user profile
        if (isExerciseAppropriate(exercise, userProfile)) {
          filteredPlan[category].push(exercise);
        }
      });
    }
  });
  
  return filteredPlan;
}

function isExerciseAppropriate(exercise, userProfile) {
  const exerciseName = exercise.name.toLowerCase();
  
  // Age-based filtering
  if (userProfile.age > 65) {
    if (exerciseName.includes('sprint') || exerciseName.includes('plyometric') || 
        exerciseName.includes('high impact')) {
      return false;
    }
  }
  
  // Weight-based filtering
  if (userProfile.weight > 100) {
    if (exerciseName.includes('jump') || exerciseName.includes('run') || 
        exerciseName.includes('high impact')) {
      return false;
    }
  }
  
  // Activity level filtering
  if (userProfile.activity === 'sedentary') {
    if (exercise.difficulty === 'Advanced') {
      return false;
    }
  }
  
  return true;
}
