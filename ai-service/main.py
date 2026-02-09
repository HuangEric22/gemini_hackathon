# main.py
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import json
from google import genai
from google.genai import types

app = FastAPI()
env_path = '../.env.local'
load_dotenv(dotenv_path=env_path)

# Enable CORS so your Next.js app can talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Your Next.js URL
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SCHEMAS ---
class ActivityItem(BaseModel):
    id: Optional[int] = None
    name: str
    place_id: Optional[str] = None
    lat: float
    lng: float

class ItineraryItem(BaseModel):
    title: str
    description: Optional[str] = ""
    start_time: str
    end_time: str
    type: str  # activity, restaurant, commute
    commute_info: Optional[str] = None

class DayPlan(BaseModel):
    day_number: int
    brief_description: str
    items: List[ItineraryItem]

class FullItinerary(BaseModel):
    days: List[DayPlan]

class GenerationRequest(BaseModel):
    user_picks: List[ActivityItem]
    num_days: int
    current_itinerary: Optional[dict] = None
    preference: Optional[str] = ""

# --- GENERATOR ---
class ItineraryGenerator:
    def __init__(self):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        self.model_id = "gemini-3-flash-preview" # or your preferred version

    def generate(self, req: GenerationRequest):
        prompt = f"""
        Role: Expert Travel Planner
        Task: Create a logical itinerary for {req.num_days} days.
        
        Input:
        - User Selections: {json.dumps([p.model_dump() for p in req.user_picks])}
        - Current Itinerary: {json.dumps(req.current_itinerary) if req.current_itinerary else "None"}
        - User Feedback/Preference: "{req.preference}"
        
        Requirements:
        1. Distribute activities based on distance.
        2. Sequence: Breakfast -> Morning Activity -> Lunch -> Afternoon Activity -> Dinner.
        3. Include 'commute' items between activities with estimated travel times.
        4. If current_itinerary is provided, respect its structure but apply the User Feedback.
        """
        
        response = self.client.models.generate_content(
            model=self.model_id,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_json_schema": FullItinerary.model_json_schema(),
            },
        )
        return response.text

generator = ItineraryGenerator()

@app.post("/generate")
async def generate_itinerary(req: GenerationRequest):
    result_json_str = generator.generate(req)
    return json.loads(result_json_str)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)