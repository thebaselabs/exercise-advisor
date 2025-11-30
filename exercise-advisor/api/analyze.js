// analyze.js - FIXED MODEL NAME
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('API Request received:', req.body);
    
    const { type, data, userProfile } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Missing request type' });
    }

    if (type === 'calories') {
      if (!data || !data.foodName) {
        return res.status(400).json({ error: 'Missing food data' });
      }
      const result = await calculateCaloriesWithAI(data.foodName, data.quantity, data.unit);
      return res.status(200).json(result);
    } else if (type === 'exercise') {
      if (!data || !data.totalCalories) {
        return res.status(400).json({ error: 'Missing exercise data' });
      }
      const result = await generateExercisePlan(data.totalCalories, userProfile);
      return res.status(200).json(result);
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

async function calculateCaloriesWithAI(foodName, quantity, unit) {
  try {
    // FIX: Use correct model name
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    Calculate calories for: "${foodName}" with quantity ${quantity} ${unit}.
    
    Consider:
    - Cooking method (fried, grilled, baked, etc.)
    - Typical portion sizes
    - Standard food database values
    
    Return ONLY JSON: {"calories": number, "confidence": "high/medium/low"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('Calorie response:', text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('AI returned invalid response format');
    }
  } catch (error) {
    console.error('Calorie calculation error:', error);
    throw new Error(`AI calorie calculation failed: ${error.message}`);
  }
}

async function generateExercisePlan(totalCalories, userProfile) {
  try {
    // FIX: Use correct model name
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    Create exercise plan for ${totalCalories} calories.
    
    USER: ${userProfile.age} years, ${userProfile.weight} kg, ${userProfile.gender}, ${userProfile.activity}
    
    Provide 3 exercises for EACH category (home, outdoor, gym):
    
    For each exercise include:
    - name: String
    - emoji: String (ONE relevant emoji)
    - duration: String
    - calories: Number
    - instructions: String
    - difficulty: String
    - needsEstimate: Boolean
    
    Return JSON: { home: Array[3], outdoor: Array[3], gym: Array[3] }`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('Exercise response:', text);
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const exercisePlan = JSON.parse(jsonMatch[0]);
      return ensureEmojis(exercisePlan);
    } else {
      throw new Error('AI returned invalid exercise plan format');
    }
  } catch (error) {
    console.error('Exercise planning error:', error);
    throw new Error(`AI exercise planning failed: ${error.message}`);
  }
}

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
