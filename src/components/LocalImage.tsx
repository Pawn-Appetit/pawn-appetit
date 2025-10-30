import { Image, type ImageProps } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";

function LocalImage(props: ImageProps & { alt?: string }) {
  const { data: imageSrc } = useQuery({
    queryKey: ["image", props.src],
    queryFn: async () => {
      const image = props.src;
      if (image?.startsWith("http")) {
        return image;
      }
      if (image) {
        return await convertFileSrc(image);
      }
    },
    staleTime: Infinity,
    enabled: !!props.src,
  });

  return <Image {...props} src={imageSrc} />;
}

export default LocalImage;
