import { useEffect, useState } from "react";
import defaultAvatar from "../assets/default-avatar.svg";

const getImageUrl = (image) => {
  if (!image || image === "default.svg") return "";
  return `${process.env.REACT_APP_PROFILE_PICS_PATHS}${image}`;
};

function Avatar({ image, alt, className }) {
  const imageUrl = getImageUrl(image);
  const [hasFailed, setHasFailed] = useState(!imageUrl);

  useEffect(() => setHasFailed(!imageUrl), [imageUrl]);

  return (
    <img
      className={className}
      src={hasFailed ? defaultAvatar : imageUrl}
      alt={alt}
      onError={() => setHasFailed(true)}
    />
  );
}

export default Avatar;
