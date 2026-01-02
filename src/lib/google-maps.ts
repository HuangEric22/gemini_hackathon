import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

setOptions({
    key: process.env.GOOGLE_MAPS_KEY,
    v: "weekly",
    libraries: ["places"],
    language: "en"
})

export const LoadPlacesLibrary = () => importLibrary("places");
 