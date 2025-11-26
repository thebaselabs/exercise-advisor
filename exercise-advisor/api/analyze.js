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
      
      // Activity level based intensity mapping
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

      prompt = `Create comprehensive exercise plans to burn approximately ${Math.round(totalCalories)} calories.

USER PROFILE:
- Gender: ${userProfile.gender}
- Age: ${userProfile.age}
- Weight: ${userProfile.weight} kg
- Activity Level: ${userProfile.activity} (${userIntensity.description})

CRITICAL REQUIREMENTS:

1. EXERCISE STRUCTURE:
   - Provide 7-8 exercises PER category (Home, Outdoor, Gym)
   - EACH exercise should burn approximately ${Math.round(totalCalories)} calories
   - MAXIMUM DURATION: ${userIntensity.duration} per exercise
   - Calories can vary slightly (±20 calories) around the target
   - Each exercise is a COMPLETE standalone workout

2. ACTIVITY LEVEL ADJUSTMENT:
   - User is ${userProfile.activity} - use ${userIntensity.intensity} intensity
   - Duration range: ${userIntensity.duration}
   - Exercise types: ${userIntensity.exercises}
   - Adjust intensity NOT duration beyond ${userIntensity.duration} limit

3. EXERCISE DETAILS:
   Each exercise must include:
   - name
   - duration (within ${userIntensity.duration} range)
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
- Use MET values adjusted for ${userProfile.weight}kg
- MAX duration: ${userIntensity.duration} - do NOT exceed this
- ${userIntensity.intensity} intensity for ${userProfile.activity} user
- Ensure realistic, achievable workouts`;

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
