import Swal from 'sweetalert2';

/**
 * Browser-side direct commits to the production GitHub branch are disabled for supply-chain security.
 * Configure TARGET_GAS_URL via Cloudflare Pages Environment Variables instead.
 */
export const updateGasUrlOnGithub = async (_newUrl: string, _githubPat: string): Promise<boolean> => {
  void _newUrl;
  void _githubPat;
  await Swal.fire({
    icon: 'warning',
    title: 'Đã vô hiệu hóa đẩy code từ trình duyệt',
    text: 'Vì lý do bảo mật, không cho phép dùng GitHub PAT trên trình duyệt để ghi đè nhánh main. Vui lòng cập nhật biến môi trường TARGET_GAS_URL trên Cloudflare Pages.',
  });
  return false;
};
