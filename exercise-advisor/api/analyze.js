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
      prompt = `Calculate total calories for this food item. Return ONLY a number, no text:
Food: ${foodName}
Quantity: ${quantity}
Unit: ${unit}

Examples:
- "apple, 2 pieces" = 104
- "chicken breast, 1 serving" = 165
- "rice, 1 cup" = 130
- "pizza, 2 slices" = 570

Return only the total calorie number:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const calories = parseFloat(text.replace(/[^\d.]/g, ''));
      
      if (isNaN(calories)) {
        throw new Error(`AI returned invalid number: ${text}`);
      }

      return res.json({ calories });

    } else if (type === 'exercise') {
      const { totalCalories } = data;
      
      // Map activity levels to exercise intensity
      const activityLevelInstructions = {
        'sedentary': 'Use only VERY EASY, beginner-friendly exercises. Focus on walking, gentle stretching, light movements. Maximum 3-4 exercises total.',
        'light': 'Use low to moderate intensity exercises. Suitable for beginners with some activity. 4-5 exercises total.',
        'moderate': 'Use moderate intensity exercises. Mix of cardio and strength. 5-6 exercises total.',
        'active': 'Use challenging, high-intensity exercises. Include advanced movements. 6-7 exercises total.',
        'athlete': 'Use professional, high-intensity advanced exercises. Maximum challenge. 7-8 exercises total.'
      };

      const intensityGuide = activityLevelInstructions[userProfile.activity.toLowerCase()] || activityLevelInstructions.moderate;

      prompt = `Create a COMPLETE exercise plan that will burn EXACTLY ${Math.round(totalCalories)} calories in total when ALL exercises are completed.

USER PROFILE:
- Gender: ${userProfile.gender}
- Age: ${userProfile.age}
- Weight: ${userProfile.weight} kg
- Activity Level: ${userProfile.activity}

CRITICAL REQUIREMENTS:

1. CUMULATIVE CALORIE TARGET:
   - The SUM of calories from ALL exercises must equal ${Math.round(totalCalories)} kcal
   - Adjust exercise durations to reach this exact total
   - Do NOT exceed the target calories

2. ACTIVITY LEVEL ADJUSTMENT:
   ${intensityGuide}
   - Exercise selection MUST match the user's activity level
   - Sedentary: Only gentle, easy exercises
   - Athlete: Advanced, high-intensity exercises

3. EXERCISE STRUCTURE:
   - Provide 3-8 exercises total (based on activity level above)
   - Each exercise must include:
     - name
     - duration (in minutes)
     - calories (weight-adjusted for ${userProfile.weight}kg)
     - instructions
     - difficulty

4. FORMAT as valid JSON:
{
  "total_calories_target": ${Math.round(totalCalories)},
  "estimated_total_calories_burned": ${Math.round(totalCalories)},
  "exercises": [
    {
      "name": "Exercise Name",
      "duration": "X min",
      "calories": Y,
      "instructions": "Step-by-step instructions",
      "difficulty": "Beginner/Intermediate/Advanced"
    }
  ]
}

CALCULATION NOTES:
- Use MET (Metabolic Equivalent) values adjusted for ${userProfile.weight}kg
- Ensure the SUM of all exercise calories = ${Math.round(totalCalories)}
- Be realistic with durations and intensity
- Consider the user's activity level for appropriate exercise selection`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const exercisePlan = JSON.parse(jsonMatch[0]);
      
      // Validate total calories
      const calculatedTotal = exercisePlan.exercises.reduce((sum, exercise) => sum + exercise.calories, 0);
      const target = Math.round(totalCalories);
      
      // Allow small variance (±10 calories)
      if (Math.abs(calculatedTotal - target) > 10) {
        console.warn(`Calorie mismatch: Target ${target}, Calculated ${calculatedTotal}`);
      }

      return res.json(exercisePlan);

    } else {
      return res.status(400).json({ error: 'Invalid request type' });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'AI processing failed', 
      details: error.message 
    });
  }
}
