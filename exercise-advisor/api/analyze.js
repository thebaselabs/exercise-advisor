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
        'sedentary': 'Use only VERY EASY, beginner-friendly exercises. Focus on walking, gentle stretching, light movements. Each exercise should be low intensity.',
        'light': 'Use low to moderate intensity exercises. Suitable for beginners with some activity.',
        'moderate': 'Use moderate intensity exercises. Mix of cardio and strength.',
        'active': 'Use challenging, high-intensity exercises. Include advanced movements.',
        'athlete': 'Use professional, high-intensity advanced exercises. Maximum challenge.'
      };

      const intensityGuide = activityLevelInstructions[userProfile.activity.toLowerCase()] || activityLevelInstructions.moderate;

      prompt = `Create comprehensive exercise plans to burn approximately ${Math.round(totalCalories)} calories.

USER PROFILE:
- Gender: ${userProfile.gender}
- Age: ${userProfile.age}
- Weight: ${userProfile.weight} kg
- Activity Level: ${userProfile.activity}

CRITICAL REQUIREMENTS:

1. EXERCISE STRUCTURE:
   - Provide 7-8 exercises PER category (Home, Outdoor, Gym)
   - EACH exercise should burn approximately ${Math.round(totalCalories)} calories
   - Calories can vary slightly (±20 calories) around the target
   - Each exercise is a COMPLETE standalone workout

2. ACTIVITY LEVEL ADJUSTMENT:
   ${intensityGuide}
   - Exercise selection MUST match the user's activity level
   - Adjust durations and intensities accordingly

3. EXERCISE DETAILS:
   Each exercise must include:
   - name
   - duration (realistic time to burn ~${Math.round(totalCalories)} calories)
   - calories (approximately ${Math.round(totalCalories)}, weight-adjusted for ${userProfile.weight}kg)
   - instructions
   - difficulty

4. FORMAT as valid JSON:
{
  "home": [
    {
      "name": "Exercise Name",
      "duration": "X min",
      "calories": ${Math.round(totalCalories)},
      "instructions": "Step-by-step instructions",
      "difficulty": "Beginner/Intermediate/Advanced"
    }
  ],
  "outdoor": [...],
  "gym": [...]
}

CALCULATION NOTES:
- Use MET (Metabolic Equivalent) values adjusted for ${userProfile.weight}kg
- Each exercise duration should be realistic to burn ~${Math.round(totalCalories)} calories
- Consider the user's activity level for appropriate exercise selection
- Ensure variety in each category`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const exercisePlan = JSON.parse(jsonMatch[0]);
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
