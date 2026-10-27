import { useEffect, useState } from "react";
import defaultAvatar from "../assets/default-avatar.svg";
import { host } from "../utils/APIRoutes";

const getImageUrl = (image) => {
  if (!image || image === "default.svg") return "";
  const basePath = process.env.REACT_APP_PROFILE_PICS_PATHS || `${host}/images/profile_pictures/`;
  const cleanBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${cleanBase}${image}`;
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
